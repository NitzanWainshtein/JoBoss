import boto3
import os
import mimetypes
import json

s3 = boto3.client('s3', region_name='us-east-1')
sts = boto3.client('sts')

account_id = sts.get_caller_identity()['Account']
bucket_name = f'joboss-frontend-{account_id}'

try:
    s3.head_bucket(Bucket=bucket_name)
    print(f'Using existing bucket: {bucket_name}')
except Exception:
    s3.create_bucket(Bucket=bucket_name)
    print(f'Created bucket: {bucket_name}')

s3.put_bucket_website(
    Bucket=bucket_name,
    WebsiteConfiguration={
        'IndexDocument': {'Suffix': 'index.html'},
        'ErrorDocument': {'Key': 'index.html'}
    }
)

s3.delete_public_access_block(Bucket=bucket_name)

policy = json.dumps({
    "Version": "2012-10-17",
    "Statement": [{
        "Sid": "PublicReadGetObject",
        "Effect": "Allow",
        "Principal": "*",
        "Action": "s3:GetObject",
        "Resource": f"arn:aws:s3:::{bucket_name}/*"
    }]
})
s3.put_bucket_policy(Bucket=bucket_name, Policy=policy)

dist_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
uploaded = 0
for root, dirs, files in os.walk(dist_path):
    for file in files:
        local_path = os.path.join(root, file)
        s3_key = os.path.relpath(local_path, dist_path).replace('\\', '/')
        content_type, _ = mimetypes.guess_type(file)
        content_type = content_type or 'application/octet-stream'
        s3.upload_file(local_path, bucket_name, s3_key, ExtraArgs={'ContentType': content_type})
        uploaded += 1

print(f'Uploaded {uploaded} files.')
print(f'Site: http://{bucket_name}.s3-website-us-east-1.amazonaws.com')
