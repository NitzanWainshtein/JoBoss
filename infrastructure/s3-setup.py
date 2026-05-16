import boto3

s3 = boto3.client('s3', region_name='us-east-1')

bucket_name = 'joboss-resumes-' + boto3.client('sts').get_caller_identity()['Account']

s3.create_bucket(Bucket=bucket_name)

# חסימת גישה ציבורית
s3.put_public_access_block(
    Bucket=bucket_name,
    PublicAccessBlockConfiguration={
        'BlockPublicAcls': True,
        'IgnorePublicAcls': True,
        'BlockPublicPolicy': True,
        'RestrictPublicBuckets': True
    }
)

print(f"Bucket נוצר: {bucket_name}")
print("שמרו את השם הזה!")