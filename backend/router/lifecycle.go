package router

import (
	"context"
	"encoding/json"
	"errors"
	"khairul169/garage-webui/utils"
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

// Lifecycle exposes a simplified object-expiration configuration on top of the
// S3 lifecycle API. Garage supports the Expiration action of
// PutBucketLifecycleConfiguration, which lets objects be deleted after a number
// of days (issue #51).
type Lifecycle struct{}

const lifecycleRuleID = "garage-webui-expire-all"

type lifecycleConfig struct {
	Enabled bool  `json:"enabled"`
	Days    int32 `json:"days"`
}

// isNoLifecycleErr reports whether the error means the bucket simply has no
// lifecycle configuration yet.
func isNoLifecycleErr(err error) bool {
	var ae smithy.APIError
	if errors.As(err, &ae) {
		code := ae.ErrorCode()
		return code == "NoSuchLifecycleConfiguration" ||
			strings.Contains(strings.ToLower(code), "lifecycle")
	}
	return false
}

func (l *Lifecycle) Get(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")

	client, s3Bucket, err := resolveBucket(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	res, err := client.GetBucketLifecycleConfiguration(context.Background(), &s3.GetBucketLifecycleConfigurationInput{
		Bucket: aws.String(s3Bucket),
	})
	if err != nil {
		if isNoLifecycleErr(err) {
			utils.ResponseSuccess(w, lifecycleConfig{Enabled: false})
			return
		}
		utils.ResponseError(w, err)
		return
	}

	cfg := lifecycleConfig{Enabled: false}
	for _, rule := range res.Rules {
		if rule.Status == types.ExpirationStatusEnabled &&
			rule.Expiration != nil && rule.Expiration.Days != nil {
			cfg.Enabled = true
			cfg.Days = *rule.Expiration.Days
			break
		}
	}

	utils.ResponseSuccess(w, cfg)
}

func (l *Lifecycle) Set(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")

	var payload lifecycleConfig
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		utils.ResponseError(w, err)
		return
	}

	client, s3Bucket, err := resolveBucket(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	// Disabling expiration removes the lifecycle configuration entirely.
	if !payload.Enabled || payload.Days <= 0 {
		_, err := client.DeleteBucketLifecycle(context.Background(), &s3.DeleteBucketLifecycleInput{
			Bucket: aws.String(s3Bucket),
		})
		if err != nil && !isNoLifecycleErr(err) {
			utils.ResponseError(w, err)
			return
		}
		utils.ResponseSuccess(w, lifecycleConfig{Enabled: false})
		return
	}

	_, err = client.PutBucketLifecycleConfiguration(context.Background(), &s3.PutBucketLifecycleConfigurationInput{
		Bucket: aws.String(s3Bucket),
		LifecycleConfiguration: &types.BucketLifecycleConfiguration{
			Rules: []types.LifecycleRule{
				{
					ID:     aws.String(lifecycleRuleID),
					Status: types.ExpirationStatusEnabled,
					// Garage requires the prefix to be inside the Filter element.
					// LifecycleRuleFilter is a union type in the AWS SDK, so an
					// empty prefix member matches all objects.
					Filter:     &types.LifecycleRuleFilterMemberPrefix{Value: ""},
					Expiration: &types.LifecycleExpiration{Days: aws.Int32(payload.Days)},
				},
			},
		},
	})
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	utils.ResponseSuccess(w, payload)
}
