import json
import os
import re
import boto3
import base64
from datetime import datetime, timezone
from uuid import uuid4

s3 = boto3.client('s3')
BUCKET_NAME = os.environ.get('BUCKET_NAME', 'joboss-resumes-171109860478')
MAX_RESUME_BYTES = 10 * 1024 * 1024  # 10MB

# CORS: reflect the request Origin only when allowlisted (CloudFront prod +
# local dev). The Chrome extension is unaffected — host_permissions bypass CORS.
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'https://d231wno34rvped.cloudfront.net')
ALLOWED_ORIGINS = {FRONTEND_URL, 'http://localhost:5173'}
_cors_origin = FRONTEND_URL


def _set_cors_origin(event):
    global _cors_origin
    headers = event.get('headers') or {}
    origin = headers.get('origin') or headers.get('Origin') or ''
    _cors_origin = origin if origin in ALLOWED_ORIGINS else FRONTEND_URL


def _cors_headers():
    return {
        'Access-Control-Allow-Origin': _cors_origin,
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
    }


def get_now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def sanitize_file_name(name):
    """Keep only the base name and safe characters (no path traversal)."""
    base = (name or 'resume.pdf').replace('\\', '/').split('/')[-1]
    base = re.sub(r'[^A-Za-z0-9._֐-׿ -]', '_', base).strip() or 'resume.pdf'
    return base[:120]


def resp(status, body):
    return {'statusCode': status, 'headers': _cors_headers(), 'body': json.dumps(body)}


def lambda_handler(event, context):
    _set_cors_origin(event)
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
            if len(file_content) > MAX_RESUME_BYTES:
                return resp(400, {'error': 'File too large (max 10MB)'})
            if not file_content.startswith(b'%PDF'):
                return resp(400, {'error': 'File must be a PDF'})
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

        # Presigned mode: short-lived POST policy; the browser uploads straight
        # to S3. POST (unlike presigned PUT) lets S3 itself enforce a size cap
        # via content-length-range — a huge file is rejected by S3, not billed.
        post = s3.generate_presigned_post(
            Bucket=BUCKET_NAME,
            Key=s3_key,
            Fields={'Content-Type': 'application/pdf'},
            Conditions=[
                {'Content-Type': 'application/pdf'},
                ['content-length-range', 1, MAX_RESUME_BYTES],
            ],
            ExpiresIn=300,
        )
        return resp(200, {
            'upload': post,  # {url, fields} — browser sends multipart POST
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
