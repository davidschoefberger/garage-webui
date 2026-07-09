package router

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

type Browse struct{}

// encodeKeyPath URL-encodes each segment of an object key while keeping the "/"
// delimiters, so keys with special characters produce valid browse URLs (#52).
func encodeKeyPath(key string) string {
	parts := strings.Split(key, "/")
	for i, p := range parts {
		parts[i] = url.PathEscape(p)
	}
	return strings.Join(parts, "/")
}

func (b *Browse) GetObjects(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	bucket := r.PathValue("bucket")
	prefix := query.Get("prefix")
	continuationToken := query.Get("next")

	limit, err := strconv.Atoi(query.Get("limit"))
	if err != nil {
		limit = 100
	}

	client, s3Bucket, err := resolveBucket(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	objects, err := client.ListObjectsV2(context.Background(), &s3.ListObjectsV2Input{
		Bucket:            aws.String(s3Bucket),
		Prefix:            aws.String(prefix),
		Delimiter:         aws.String("/"),
		MaxKeys:           aws.Int32(int32(limit)),
		ContinuationToken: aws.String(continuationToken),
	})

	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	result := schema.BrowseObjectResult{
		Prefixes:  []string{},
		Objects:   []schema.BrowserObject{},
		Prefix:    prefix,
		NextToken: objects.NextContinuationToken,
	}

	for _, prefix := range objects.CommonPrefixes {
		result.Prefixes = append(result.Prefixes, *prefix.Prefix)
	}

	for _, object := range objects.Contents {
		key := strings.TrimPrefix(*object.Key, prefix)
		if key == "" {
			continue
		}

		result.Objects = append(result.Objects, schema.BrowserObject{
			ObjectKey:    &key,
			LastModified: object.LastModified,
			Size:         object.Size,
			Url:          fmt.Sprintf("/browse/%s/%s", bucket, encodeKeyPath(*object.Key)),
		})
	}

	utils.ResponseSuccess(w, result)
}

func (b *Browse) GetOneObject(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")
	key := r.PathValue("key")
	queryParams := r.URL.Query()
	view := queryParams.Get("view") == "1"
	thumbnail := queryParams.Get("thumb") == "1"
	download := queryParams.Get("dl") == "1"

	client, s3Bucket, err := resolveBucket(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	if !view && !download && !thumbnail {
		object, err := client.HeadObject(context.Background(), &s3.HeadObjectInput{
			Bucket: aws.String(s3Bucket),
			Key:    aws.String(key),
		})
		if err != nil {
			utils.ResponseError(w, err)
		}
		utils.ResponseSuccess(w, object)
		return
	}

	object, err := client.GetObject(context.Background(), &s3.GetObjectInput{
		Bucket: aws.String(s3Bucket),
		Key:    aws.String(key),
	})

	if err != nil {
		var ae smithy.APIError
		if errors.As(err, &ae) && ae.ErrorCode() == "NoSuchKey" {
			utils.ResponseErrorStatus(w, err, http.StatusNotFound)
			return
		}

		utils.ResponseError(w, err)
		return
	}

	defer object.Body.Close()
	keys := strings.Split(key, "/")

	if download {
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", keys[len(keys)-1]))
	} else if thumbnail {
		body, err := io.ReadAll(object.Body)
		if err != nil {
			utils.ResponseError(w, err)
			return
		}

		thumb, err := utils.CreateThumbnailImage(body, 64, 64)
		if err != nil {

			utils.ResponseError(w, err)
			return
		}

		w.Header().Set("Content-Type", "image/png")
		w.Write(thumb)
		return
	}

	w.Header().Set("Cache-Control", "max-age=86400")
	w.Header().Set("Last-Modified", object.LastModified.Format(time.RFC1123))

	if object.ContentType != nil {
		w.Header().Set("Content-Type", *object.ContentType)
	} else {
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	if object.ContentLength != nil {
		w.Header().Set("Content-Length", strconv.FormatInt(*object.ContentLength, 10))
	}
	if object.ETag != nil {
		w.Header().Set("Etag", *object.ETag)
	}

	_, err = io.Copy(w, object.Body)

	if err != nil {
		utils.ResponseError(w, err)
		return
	}
}

func (b *Browse) PutObject(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")
	key := r.PathValue("key")
	isDirectory := strings.HasSuffix(key, "/")

	file, headers, err := r.FormFile("file")
	if err != nil && !isDirectory {
		utils.ResponseError(w, err)
		return
	}

	if file != nil {
		defer file.Close()
	}

	client, s3Bucket, err := resolveBucket(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	// Directory marker: create an empty object with a trailing slash.
	if file == nil {
		result, err := client.PutObject(context.Background(), &s3.PutObjectInput{
			Bucket: aws.String(s3Bucket),
			Key:    aws.String(key),
		})
		if err != nil {
			utils.ResponseError(w, fmt.Errorf("cannot put object: %w", err))
			return
		}
		utils.ResponseSuccess(w, result)
		return
	}

	// Use the managed uploader so large files are streamed as a multipart
	// upload instead of being buffered/sent in a single request (#44).
	uploader := manager.NewUploader(client, func(u *manager.Uploader) {
		u.PartSize = 16 * 1024 * 1024 // 16 MiB parts
		u.Concurrency = 3
	})

	result, err := uploader.Upload(context.Background(), &s3.PutObjectInput{
		Bucket:      aws.String(s3Bucket),
		Key:         aws.String(key),
		Body:        file,
		ContentType: aws.String(headers.Header.Get("Content-Type")),
	})

	if err != nil {
		utils.ResponseError(w, fmt.Errorf("cannot put object: %w", err))
		return
	}

	utils.ResponseSuccess(w, result)
}

func (b *Browse) DeleteObject(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")
	key := r.PathValue("key")
	recursive := r.URL.Query().Get("recursive") == "true"
	isDirectory := strings.HasSuffix(key, "/")

	client, s3Bucket, err := resolveBucket(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	// Delete directory and its content
	if isDirectory && recursive {
		objects, err := client.ListObjectsV2(context.Background(), &s3.ListObjectsV2Input{
			Bucket: aws.String(s3Bucket),
			Prefix: aws.String(key),
		})

		if err != nil {
			utils.ResponseError(w, err)
			return
		}

		if len(objects.Contents) == 0 {
			utils.ResponseSuccess(w, true)
			return
		}

		keys := make([]types.ObjectIdentifier, 0, len(objects.Contents))

		for _, object := range objects.Contents {
			keys = append(keys, types.ObjectIdentifier{
				Key: object.Key,
			})
		}

		res, err := client.DeleteObjects(context.Background(), &s3.DeleteObjectsInput{
			Bucket: aws.String(s3Bucket),
			Delete: &types.Delete{Objects: keys},
		})

		if err != nil {
			utils.ResponseError(w, fmt.Errorf("cannot delete object: %w", err))
			return
		}

		if len(res.Errors) > 0 {
			utils.ResponseError(w, fmt.Errorf("cannot delete object: %v", res.Errors[0]))
			return
		}

		utils.ResponseSuccess(w, res)
		return
	}

	// Delete single object
	res, err := client.DeleteObject(context.Background(), &s3.DeleteObjectInput{
		Bucket: aws.String(s3Bucket),
		Key:    aws.String(key),
	})

	if err != nil {
		utils.ResponseError(w, fmt.Errorf("cannot delete object: %w", err))
		return
	}

	utils.ResponseSuccess(w, res)
}

type renamePayload struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// RenameObject renames/moves an object or a whole folder. S3 has no native
// rename, so this copies to the new key and deletes the old one.
func (b *Browse) RenameObject(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")

	var payload renamePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		utils.ResponseError(w, err)
		return
	}
	if payload.From == "" || payload.To == "" || payload.From == payload.To {
		utils.ResponseError(w, errors.New("invalid source or destination key"))
		return
	}

	client, s3Bucket, err := resolveBucket(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	ctx := context.Background()
	isDirectory := strings.HasSuffix(payload.From, "/")

	// Collect the source keys to move (a single object, or every object under
	// a folder prefix).
	var sourceKeys []string
	if isDirectory {
		var token *string
		for {
			objects, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
				Bucket:            aws.String(s3Bucket),
				Prefix:            aws.String(payload.From),
				ContinuationToken: token,
			})
			if err != nil {
				utils.ResponseError(w, err)
				return
			}
			for _, o := range objects.Contents {
				sourceKeys = append(sourceKeys, *o.Key)
			}
			if objects.IsTruncated == nil || !*objects.IsTruncated {
				break
			}
			token = objects.NextContinuationToken
		}
	} else {
		sourceKeys = []string{payload.From}
	}

	if len(sourceKeys) == 0 {
		utils.ResponseError(w, errors.New("source not found"))
		return
	}

	// Copy every source key to its new location.
	for _, srcKey := range sourceKeys {
		destKey := payload.To + strings.TrimPrefix(srcKey, payload.From)
		copySource := s3Bucket + "/" + encodeKeyPath(srcKey)

		if _, err := client.CopyObject(ctx, &s3.CopyObjectInput{
			Bucket:     aws.String(s3Bucket),
			Key:        aws.String(destKey),
			CopySource: aws.String(copySource),
		}); err != nil {
			utils.ResponseError(w, fmt.Errorf("cannot copy %s: %w", srcKey, err))
			return
		}
	}

	// Delete the originals.
	ids := make([]types.ObjectIdentifier, 0, len(sourceKeys))
	for _, srcKey := range sourceKeys {
		ids = append(ids, types.ObjectIdentifier{Key: aws.String(srcKey)})
	}
	if _, err := client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
		Bucket: aws.String(s3Bucket),
		Delete: &types.Delete{Objects: ids},
	}); err != nil {
		utils.ResponseError(w, fmt.Errorf("cannot remove source after copy: %w", err))
		return
	}

	utils.ResponseSuccess(w, true)
}

// resolvedBucket holds the credentials and the S3-addressable name resolved for
// a bucket reference (its ID or a global alias).
type resolvedBucket struct {
	creds aws.CredentialsProvider
	name  string
}

// getBucketInfo fetches bucket info by ID first, falling back to a global alias
// for backward compatibility with older links.
func getBucketInfo(bucketRef string) (*schema.Bucket, error) {
	body, err := utils.Garage.Fetch("/v2/GetBucketInfo?id="+url.QueryEscape(bucketRef), &utils.FetchOptions{})
	if err != nil {
		body, err = utils.Garage.Fetch("/v2/GetBucketInfo?globalAlias="+url.QueryEscape(bucketRef), &utils.FetchOptions{})
		if err != nil {
			return nil, err
		}
	}

	var bucket schema.Bucket
	if err := json.Unmarshal(body, &bucket); err != nil {
		return nil, err
	}
	return &bucket, nil
}

// resolveBucket returns an S3 client plus the S3-addressable bucket name for the
// given bucket reference (ID or global alias). Buckets without a global alias
// are addressed through the local alias of a read/write key (issues #24, #65, #67).
func resolveBucket(bucketRef string) (*s3.Client, string, error) {
	cacheKey := fmt.Sprintf("bucket:%s", bucketRef)

	var r *resolvedBucket
	if cached := utils.Cache.Get(cacheKey); cached != nil {
		r = cached.(*resolvedBucket)
	} else {
		info, err := getBucketInfo(bucketRef)
		if err != nil {
			return nil, "", fmt.Errorf("cannot get info for bucket %s: %w", bucketRef, err)
		}

		// Prefer a key that can read & write, but fall back to any usable key.
		var chosen *schema.KeyElement
		for i := range info.Keys {
			k := &info.Keys[i]
			if k.Permissions.Read && k.Permissions.Write {
				chosen = k
				break
			}
		}
		if chosen == nil {
			for i := range info.Keys {
				if info.Keys[i].Permissions.Read {
					chosen = &info.Keys[i]
					break
				}
			}
		}
		if chosen == nil {
			return nil, "", fmt.Errorf("no usable key available for bucket %s", bucketRef)
		}

		body, err := utils.Garage.Fetch(fmt.Sprintf("/v2/GetKeyInfo?id=%s&showSecretKey=true", chosen.AccessKeyID), &utils.FetchOptions{})
		if err != nil {
			return nil, "", err
		}
		var key schema.KeyElement
		if err := json.Unmarshal(body, &key); err != nil {
			return nil, "", err
		}

		// Determine the S3-addressable name: a global alias if present, else the
		// chosen key's local alias for this bucket.
		name := ""
		if len(info.GlobalAliases) > 0 {
			name = info.GlobalAliases[0]
		} else if len(chosen.BucketLocalAliases) > 0 {
			name = chosen.BucketLocalAliases[0]
		}
		if name == "" {
			return nil, "", fmt.Errorf("bucket %s has no global or local alias to address via S3", bucketRef)
		}

		r = &resolvedBucket{
			creds: credentials.NewStaticCredentialsProvider(key.AccessKeyID, key.SecretAccessKey, ""),
			name:  name,
		}
		utils.Cache.Set(cacheKey, r, time.Hour)
	}

	client := newS3Client(r.creds)
	return client, r.name, nil
}

func newS3Client(creds aws.CredentialsProvider) *s3.Client {
	// Determine endpoint and whether to disable HTTPS
	endpoint := utils.Garage.GetS3Endpoint()
	disableHTTPS := !strings.HasPrefix(endpoint, "https://")

	awsConfig := aws.Config{
		Credentials: creds,
		Region:      utils.Garage.GetS3Region(),
		// Honor TLS_INSECURE_SKIP_VERIFY for self-signed Garage endpoints (#53).
		HTTPClient: utils.Garage.HTTPClient(),
	}

	// Build S3 client with custom endpoint resolver for proper signing
	return s3.NewFromConfig(awsConfig, func(o *s3.Options) {
		o.UsePathStyle = true
		o.EndpointOptions.DisableHTTPS = disableHTTPS
		o.EndpointResolver = s3.EndpointResolverFunc(func(region string, opts s3.EndpointResolverOptions) (aws.Endpoint, error) {
			return aws.Endpoint{
				URL:           endpoint,
				SigningRegion: utils.Garage.GetS3Region(),
			}, nil
		})
	})
}
