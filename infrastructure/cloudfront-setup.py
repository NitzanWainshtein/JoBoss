import boto3

cf = boto3.client('cloudfront', region_name='us-east-1')

bucket_name = 'joboss-frontend-171109860478'

response = cf.create_distribution(
    DistributionConfig={
        'CallerReference': 'joboss-frontend-1',
        'Origins': {
            'Quantity': 1,
            'Items': [{
                'Id': 'S3Origin',
                'DomainName': f'{bucket_name}.s3-website-us-east-1.amazonaws.com',
                'CustomOriginConfig': {
                    'HTTPPort': 80,
                    'HTTPSPort': 443,
                    'OriginProtocolPolicy': 'http-only'
                }
            }]
        },
        'DefaultCacheBehavior': {
            'TargetOriginId': 'S3Origin',
            'ViewerProtocolPolicy': 'redirect-to-https',
            'CachePolicyId': '658327ea-f89d-4fab-a63d-7e88639e58f6',
            'AllowedMethods': {
                'Quantity': 2,
                'Items': ['GET', 'HEAD']
            }
        },
        'DefaultRootObject': 'index.html',
        'Enabled': True,
        'Comment': 'joBoss Frontend',
        'CustomErrorResponses': {
            'Quantity': 1,
            'Items': [{
                'ErrorCode': 403,
                'ResponseCode': '200',
                'ResponsePagePath': '/index.html'
            }]
        }
    }
)

domain = response['Distribution']['DomainName']
dist_id = response['Distribution']['Id']
print(f'✅ CloudFront נוצר!')
print(f'URL: https://{domain}')
print(f'Distribution ID: {dist_id}')
print('⏳ לוקח ~10 דקות להיות פעיל')