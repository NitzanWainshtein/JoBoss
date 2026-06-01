import json
import boto3
import os
from datetime import datetime
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
TABLE_NAME = os.environ.get('APPLICATIONS_TABLE_NAME', 'joboss-applications')
JOBS_TABLE_NAME = os.environ.get('JOBS_TABLE_NAME', 'joboss-jobs')
table = dynamodb.Table(TABLE_NAME)
jobs_table = dynamodb.Table(JOBS_TABLE_NAME)

# Small in-invocation cache so we don't re-fetch the same job's applyUrl.
_apply_url_cache = {}


def get_job_apply_url(job_id):
    if not job_id:
        return ''
    if job_id in _apply_url_cache:
        return _apply_url_cache[job_id]
    url = ''
    try:
        res = jobs_table.get_item(Key={'jobId': job_id}, ProjectionExpression='applyUrl')
        url = (res.get('Item') or {}).get('applyUrl', '') or ''
    except Exception as e:
        print(f'JOB URL FETCH ERROR jobId={job_id}: {e}')
    _apply_url_cache[job_id] = url
    return url

CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
}

# Funnel (user-set) statuses. The auto-apply pipeline result lives in a
# separate field (autoApplyStatus) so the two tracks never overwrite each other.
FUNNEL_STATUSES = {'SUBMITTED', 'REVIEWED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'}

# Legacy status values written by the Fargate apply.py into the shared `status`
# field, mapped to the new autoApplyStatus track.
LEGACY_AUTO_APPLY_MAP = {
    'auto_apply_pending': 'pending',
    'auto_apply_success': 'success',
    'auto_apply_failed': 'failed',
}


def resp(status, body):
    return {'statusCode': status, 'headers': CORS, 'body': json.dumps(body, default=str)}


def now_iso():
    return datetime.utcnow().isoformat()


def heal_legacy_application(user_id, item):
    """Self-healing migration (read-time).

    The Fargate image still writes terminal results into the shared `status`
    field as `auto_apply_*`. We split that into the `autoApplyStatus` track and
    reset the funnel `status` to SUBMITTED so both tracks coexist.

    Two healing triggers:
      1. `status` holds an `auto_apply_*` value (fresh Fargate write). This
         terminal result is authoritative and OVERRIDES any stale
         `autoApplyStatus` (e.g. a 'pending' the Lambda wrote earlier).
      2. Recovery: `autoApplyStatus == 'pending'` but a `failReason` exists.
         `failReason` is only ever written by Fargate on failure, so the app
         actually failed. This repairs records whose `auto_apply_*` signal was
         already consumed by an earlier (buggy) heal.
    """
    job_id = item.get('jobId')
    raw_status = item.get('status', '')
    legacy = LEGACY_AUTO_APPLY_MAP.get(raw_status)

    target_auto = None
    trigger = None
    if legacy:
        target_auto = legacy            # Fargate terminal result wins.
        trigger = 'legacy_status'
    elif item.get('autoApplyStatus') == 'pending' and item.get('failReason'):
        target_auto = 'failed'          # pending + failReason ⇒ actually failed.
        trigger = 'pending_with_failreason'

    if not target_auto:
        return item

    print(
        f"HEAL[{trigger}]: jobId={job_id} rawStatus={raw_status!r} "
        f"oldAutoApply={item.get('autoApplyStatus')!r} "
        f"failReason={'yes' if item.get('failReason') else 'no'} "
        f"=> autoApplyStatus={target_auto!r}, status='SUBMITTED'"
    )

    try:
        table.update_item(
            Key={'userId': user_id, 'jobId': job_id},
            UpdateExpression='SET autoApplyStatus = :a, #s = :s, lastUpdated = :t',
            ExpressionAttributeNames={'#s': 'status'},
            ExpressionAttributeValues={
                ':a': target_auto,
                ':s': 'SUBMITTED',
                ':t': now_iso(),
            },
        )
    except Exception as e:
        print(f'HEAL ERROR jobId={job_id}: {e}')

    item['autoApplyStatus'] = target_auto
    item['status'] = 'SUBMITTED'
    return item


def normalize_application(user_id, item):
    """Ensure both tracks are present and sane for the frontend."""
    item = heal_legacy_application(user_id, item)

    # Guard: if the funnel status somehow isn't a known funnel value, default it.
    if item.get('status') not in FUNNEL_STATUSES:
        item['status'] = 'SUBMITTED'

    # Attach the job's real apply URL so the dashboard's "apply manually" button works.
    item['jobApplyUrl'] = get_job_apply_url(item.get('jobId'))

    # autoApplyStatus is optional (free users / autoApply off → absent).
    return item


def handler(event, context):
    method = event.get('httpMethod', '')

    if method == 'OPTIONS':
        return resp(200, {})

    try:
        user_id = event['requestContext']['authorizer']['claims']['sub']
    except (KeyError, TypeError):
        return resp(401, {'error': 'Unauthorized'})

    # ── GET /applications ──────────────────────────────────────────────────
    if method == 'GET':
        qs = event.get('queryStringParameters') or {}
        status_filter = qs.get('status')

        result = table.query(KeyConditionExpression=Key('userId').eq(user_id))
        applications = [normalize_application(user_id, a) for a in result['Items']]

        if status_filter:
            applications = [a for a in applications
                            if a.get('status', '').upper() == status_filter.upper()]

        applications.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
        return resp(200, {'applications': applications})

    # ── POST /applications ─────────────────────────────────────────────────
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        job_id = body.get('jobId')

        if not job_id:
            return resp(400, {'error': 'jobId required'})

        now = now_iso()
        table.put_item(Item={
            'userId': user_id,
            'jobId': job_id,
            'status': 'SUBMITTED',
            'tailoredResumeUrl': body.get('tailoredResumeUrl', ''),
            'resumeVersionId': body.get('resumeVersionId', ''),
            'company': body.get('company', ''),
            'title': body.get('title', ''),
            'createdAt': now,
            'lastUpdated': now,
        })
        return resp(200, {'success': True, 'jobId': job_id})

    # ── PUT /applications — update funnel status or clear tailoring ─────────
    if method == 'PUT':
        body = json.loads(event.get('body') or '{}')
        job_id = body.get('jobId')
        notes = body.get('notes', '')

        if not job_id:
            return resp(400, {'error': 'jobId required'})

        # Clear tailored CV
        if body.get('clearTailoring'):
            table.update_item(
                Key={'userId': user_id, 'jobId': job_id},
                UpdateExpression='REMOVE tailoredResumeUrl, tailoredResume, tailoredAt SET lastUpdated = :t',
                ExpressionAttributeValues={':t': now_iso()},
            )
            return resp(200, {'success': True})

        status = body.get('status')
        if not status:
            return resp(400, {'error': 'jobId and status required'})

        # Manual updates only ever touch the funnel `status`, never the
        # auto-apply track. Reject non-funnel values to keep the data clean.
        if status not in FUNNEL_STATUSES:
            return resp(400, {'error': f'status must be one of {sorted(FUNNEL_STATUSES)}'})

        update_expr = 'SET #s = :s, lastUpdated = :t'
        expr_names = {'#s': 'status'}
        expr_vals = {':s': status, ':t': now_iso()}

        if notes:
            update_expr += ', notes = :n'
            expr_vals[':n'] = notes

        table.update_item(
            Key={'userId': user_id, 'jobId': job_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_vals,
        )
        return resp(200, {'success': True})

    return resp(405, {'error': 'Method not allowed'})
