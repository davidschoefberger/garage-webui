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

// Cors exposes the bucket CORS configuration (S3 PutBucketCors / GetBucketCors),
// which lets browser apps from other origins talk to the bucket directly, e.g.
// for presigned client-side uploads/downloads (PR #42).
type Cors struct{}

type corsRule struct {
	AllowedOrigins []string `json:"allowedOrigins"`
	AllowedMethods []string `json:"allowedMethods"`
	AllowedHeaders []string `json:"allowedHeaders"`
	ExposeHeaders  []string `json:"exposeHeaders"`
	MaxAgeSeconds  int32    `json:"maxAgeSeconds"`
}

type corsConfig struct {
	Rules []corsRule `json:"rules"`
}

func isNoCorsErr(err error) bool {
	var ae smithy.APIError
	if errors.As(err, &ae) {
		code := ae.ErrorCode()
		return code == "NoSuchCORSConfiguration" ||
			strings.Contains(strings.ToLower(code), "cors")
	}
	return false
}

func (c *Cors) Get(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")

	client, s3Bucket, err := resolveBucket(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	res, err := client.GetBucketCors(context.Background(), &s3.GetBucketCorsInput{
		Bucket: aws.String(s3Bucket),
	})
	if err != nil {
		if isNoCorsErr(err) {
			utils.ResponseSuccess(w, corsConfig{Rules: []corsRule{}})
			return
		}
		utils.ResponseError(w, err)
		return
	}

	cfg := corsConfig{Rules: []corsRule{}}
	for _, rule := range res.CORSRules {
		cr := corsRule{
			AllowedOrigins: rule.AllowedOrigins,
			AllowedMethods: rule.AllowedMethods,
			AllowedHeaders: rule.AllowedHeaders,
			ExposeHeaders:  rule.ExposeHeaders,
		}
		if rule.MaxAgeSeconds != nil {
			cr.MaxAgeSeconds = *rule.MaxAgeSeconds
		}
		cfg.Rules = append(cfg.Rules, cr)
	}

	utils.ResponseSuccess(w, cfg)
}

func (c *Cors) Set(w http.ResponseWriter, r *http.Request) {
	bucket := r.PathValue("bucket")

	var payload corsConfig
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		utils.ResponseError(w, err)
		return
	}

	client, s3Bucket, err := resolveBucket(bucket)
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	// No rules -> remove the CORS configuration entirely.
	if len(payload.Rules) == 0 {
		_, err := client.DeleteBucketCors(context.Background(), &s3.DeleteBucketCorsInput{
			Bucket: aws.String(s3Bucket),
		})
		if err != nil && !isNoCorsErr(err) {
			utils.ResponseError(w, err)
			return
		}
		utils.ResponseSuccess(w, corsConfig{Rules: []corsRule{}})
		return
	}

	rules := make([]types.CORSRule, 0, len(payload.Rules))
	for _, r := range payload.Rules {
		// Origins and methods are required by S3; skip incomplete rules.
		if len(r.AllowedOrigins) == 0 || len(r.AllowedMethods) == 0 {
			continue
		}
		rule := types.CORSRule{
			AllowedOrigins: r.AllowedOrigins,
			AllowedMethods: r.AllowedMethods,
			AllowedHeaders: r.AllowedHeaders,
			ExposeHeaders:  r.ExposeHeaders,
		}
		if r.MaxAgeSeconds > 0 {
			rule.MaxAgeSeconds = aws.Int32(r.MaxAgeSeconds)
		}
		rules = append(rules, rule)
	}

	if len(rules) == 0 {
		utils.ResponseError(w, errors.New("each CORS rule needs at least one origin and method"))
		return
	}

	_, err = client.PutBucketCors(context.Background(), &s3.PutBucketCorsInput{
		Bucket:            aws.String(s3Bucket),
		CORSConfiguration: &types.CORSConfiguration{CORSRules: rules},
	})
	if err != nil {
		utils.ResponseError(w, err)
		return
	}

	utils.ResponseSuccess(w, payload)
}
