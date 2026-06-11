import boto3
apigw = boto3.client('apigateway', region_name='us-east-1')
apis = apigw.get_rest_apis()['items']
for a in apis:
    print(a['id'], a['name'])
    resources = apigw.get_resources(restApiId=a['id'], limit=500)['items']
    for r in resources:
        if 'application' in r.get('path', '').lower():
            print(f"  --> {r.get('path')} {r['id']}")
