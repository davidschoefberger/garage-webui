module khairul169/garage-webui

go 1.24

toolchain go1.25.12

require (
	github.com/aws/aws-sdk-go-v2 v1.42.1
	github.com/aws/aws-sdk-go-v2/credentials v1.19.28
	github.com/aws/aws-sdk-go-v2/service/s3 v1.105.0
	github.com/aws/smithy-go v1.27.3
	github.com/joho/godotenv v1.5.1
	github.com/nfnt/resize v0.0.0-20180221191011-83c6a9932646
	github.com/pelletier/go-toml/v2 v2.2.2
)

require github.com/aws/aws-sdk-go-v2/feature/s3/manager v1.22.32

require (
	github.com/alexedwards/scs/v2 v2.8.0
	github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream v1.7.14 // indirect
	github.com/aws/aws-sdk-go-v2/internal/configsources v1.4.30 // indirect
	github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 v2.7.30 // indirect
	github.com/aws/aws-sdk-go-v2/internal/v4a v1.4.31 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding v1.13.13 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/checksum v1.9.23 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/presigned-url v1.13.30 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/s3shared v1.19.31 // indirect
	golang.org/x/crypto v0.35.0
)
