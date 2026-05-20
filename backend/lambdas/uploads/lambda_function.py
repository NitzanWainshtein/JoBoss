import json
import boto3
import base64
from datetime import datetime
from uuid import uuid4

s3 = boto3.client('s3')
BUCKET_NAME = 'joboss-resumes-171109860478'


def get_now_iso():
    return datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'

def lambda_handler(event, context):
    try:
        # Parse request
        body = json.loads(event['body'])
        user_id = event['requestContext']['authorizer']['claims']['sub']
        
        file_content = base64.b64decode(body['file'])
        file_name = body.get('fileName', 'resume.pdf')
        
        # Upload to S3
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        s3_key = f'users/{user_id}/{timestamp}_{file_name}'
        
        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key,
            Body=file_content,
            ContentType='application/pdf'
        )
        
        resume_url = f's3://{BUCKET_NAME}/{s3_key}'
        uploaded_at = get_now_iso()
        resume_id = f"resume_{uuid4().hex}"
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            },
            'body': json.dumps({
                'resumeId': resume_id,
                'resumeUrl': resume_url,
                'fileName': file_name,
                'uploadedAt': uploaded_at
            })
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e)})
        }
