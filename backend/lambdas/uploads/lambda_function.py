import json
import os
import re
import boto3
import base64
from datetime import datetime
from uuid import uuid4

s3 = boto3.client('s3')
BUCKET_NAME = os.environ.get('BUCKET_NAME', 'joboss-resumes-171109860478')

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
}


def get_now_iso():
    return datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'


def sanitize_file_name(name):
    """Keep only the base name and safe characters (no path traversal)."""
    base = (name or 'resume.pdf').replace('\\', '/').split('/')[-1]
    base = re.sub(r'[^A-Za-z0-9._֐-׿ -]', '_', base).strip() or 'resume.pdf'
    return base[:120]


def resp(status, body):
    return {'statusCode': status, 'headers': CORS, 'body': json.dumps(body)}


def lambda_handler(event, context):
    try:
        method = (event.get('httpMethod') or '').upper()
        if method == 'OPTIONS':
            return resp(200, {})

        body = json.loads(event.get('body') or '{}')
        user_id = event['requestContext']['authorizer']['claims']['sub']

        file_name = sanitize_file_name(body.get('fileName'))
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        s3_key = f'users/{user_id}/{timestamp}_{file_name}'
        resume_url = f's3://{BUCKET_NAME}/{s3_key}'
        uploaded_at = get_now_iso()
        resume_id = f"resume_{uuid4().hex}"

        # Legacy mode: file content sent base64 through API Gateway. Kept for
        # backward compatibility, but limited to ~7MB by the gateway payload cap.
        if body.get('file'):
            file_content = base64.b64decode(body['file'])
            s3.put_object(
                Bucket=BUCKET_NAME,
                Key=s3_key,
                Body=file_content,
                ContentType='application/pdf',
            )
            return resp(200, {
                'resumeId': resume_id,
                'resumeUrl': resume_url,
                'fileName': file_name,
                'uploadedAt': uploaded_at,
            })

        # Presigned mode: return a short-lived PUT URL; the browser uploads the
        # file straight to S3 (no base64 inflation, no gateway size limit).
        upload_url = s3.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': s3_key,
                'ContentType': 'application/pdf',
            },
            ExpiresIn=300,
        )
        return resp(200, {
            'uploadUrl': upload_url,
            'resumeId': resume_id,
            'resumeUrl': resume_url,
            'fileName': file_name,
            'uploadedAt': uploaded_at,
        })

    except (KeyError, TypeError):
        return resp(401, {'error': 'Unauthorized'})
    except json.JSONDecodeError:
        return resp(400, {'error': 'Invalid JSON body'})
    except Exception as e:
        print(f'UPLOAD ERROR: {type(e).__name__}: {e}')
        return resp(500, {'error': 'Upload failed'})
