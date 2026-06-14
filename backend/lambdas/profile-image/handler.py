# JoBoss feature:
# - F-11: Profile Image Upload & Removal

﻿import json
import boto3
import base64
import uuid
from datetime import datetime, timezone

import os

s3 = boto3.client('s3', region_name='us-east-1')
dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
users_table = dynamodb.Table(os.environ.get('USERS_TABLE_NAME', 'joboss-users'))

# Default must match the real bucket — a stale 'joboss-resumes' default once
# caused AccessDenied on every upload when the env var wasn't set.
BUCKET = os.environ.get('BUCKET_NAME', 'joboss-resumes-171109860478')

CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

def resp(status, body):
    return {'statusCode': status, 'headers': CORS, 'body': json.dumps(body, default=str)}

def handler(event, context):
    method = event.get('httpMethod', '')

    if method == 'OPTIONS':
        return resp(200, {})

    try:
        user_id = event['requestContext']['authorizer']['claims']['sub']
    except (KeyError, TypeError):
        return resp(401, {'error': 'Unauthorized'})

    if method != 'POST':
        return resp(405, {'error': 'Method not allowed'})

    body = json.loads(event.get('body') or '{}')

    # Remove the current profile image (sent as POST {remove: true} since the
    # gateway route only exposes POST/OPTIONS).
    if body.get('remove'):
        try:
            old = users_table.get_item(Key={'userId': user_id}).get('Item', {})
            old_key = old.get('profileImageKey')
            if old_key:
                s3.delete_object(Bucket=BUCKET, Key=old_key)
        except Exception as e:
            print(f'REMOVE IMAGE: S3 delete failed: {e}')
        users_table.update_item(
            Key={'userId': user_id},
            UpdateExpression='REMOVE profileImageUrl, profileImageKey SET updatedAt = :now',
            ExpressionAttributeValues={':now': datetime.now(timezone.utc).isoformat()},
        )
        return resp(200, {'success': True, 'removed': True})

    image_base64 = body.get('image')
    file_name = body.get('fileName', 'profile.jpg')

    if not image_base64:
        return resp(400, {'error': 'image required'})

    try:
        image_data = base64.b64decode(image_base64)
    except Exception:
        return resp(400, {'error': 'Invalid base64'})

    # Limit to 5MB
    if len(image_data) > 5 * 1024 * 1024:
        return resp(400, {'error': 'Image too large (max 5MB)'})

    ext = file_name.rsplit('.', 1)[-1].lower() if '.' in file_name else 'jpg'
    if ext not in ('jpg', 'jpeg', 'png', 'webp', 'gif'):
        ext = 'jpg'

    s3_key = f'users/{user_id}/profile/avatar_{uuid.uuid4().hex[:8]}.{ext}'
    content_type = f'image/{"jpeg" if ext == "jpg" else ext}'

    # Delete old profile image if exists
    try:
        old = users_table.get_item(Key={'userId': user_id}).get('Item', {})
        old_key = old.get('profileImageKey')
        if old_key:
            s3.delete_object(Bucket=BUCKET, Key=old_key)
    except Exception:
        pass

    s3.put_object(
        Bucket=BUCKET,
        Key=s3_key,
        Body=image_data,
        ContentType=content_type,
        CacheControl='max-age=31536000',
    )

    image_url = f'https://{BUCKET}.s3.amazonaws.com/{s3_key}'

    users_table.update_item(
        Key={'userId': user_id},
        UpdateExpression='SET profileImageUrl = :url, profileImageKey = :key, updatedAt = :now',
        ExpressionAttributeValues={
            ':url': image_url,
            ':key': s3_key,
            ':now': datetime.now(timezone.utc).isoformat(),
        }
    )

    return resp(200, {'success': True, 'imageUrl': image_url})
