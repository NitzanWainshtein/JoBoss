import boto3
import os
import mimetypes

s3 = boto3.client('s3', region_name='us-east-1')
sts = boto3.client('sts')

account_id = sts.get_caller_identity()['Account']
bucket_name = f'joboss-frontend-{account_id}'

# יצירת bucket
s3.create_bucket(Bucket=bucket_name)
print(f'✅ Bucket נוצר: {bucket_name}')

# הגדרת Static Website Hosting
s3.put_bucket_website(
    Bucket=bucket_name,
    WebsiteConfiguration={
        'IndexDocument': {'Suffix': 'index.html'},
        'ErrorDocument': {'Key': 'index.html'}
    }
)

# הסרת חסימת גישה ציבורית
s3.delete_public_access_block(Bucket=bucket_name)

# הגדרת Bucket Policy לגישה ציבורית
import json
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

# העלאת כל קבצי ה-dist
dist_path = '../frontend/dist'
for root, dirs, files in os.walk(dist_path):
    for file in files:
        local_path = os.path.join(root, file)
        s3_key = os.path.relpath(local_path, dist_path).replace('\\', '/')
        content_type, _ = mimetypes.guess_type(file)
        content_type = content_type or 'application/octet-stream'
        s3.upload_file(local_path, bucket_name, s3_key, ExtraArgs={'ContentType': content_type})
        print(f'  ⬆️  {s3_key}')

print(f'\n🎉 האתר זמין ב:')
print(f'http://{bucket_name}.s3-website-us-east-1.amazonaws.com')