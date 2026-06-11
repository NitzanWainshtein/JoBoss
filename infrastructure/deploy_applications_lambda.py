import boto3, zipfile, io, os

lam = boto3.client('lambda', region_name='us-east-1')

src_dir = os.path.join(os.path.dirname(__file__), '..', 'backend', 'lambdas', 'applications')
buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
    for fname in os.listdir(src_dir):
        fpath = os.path.join(src_dir, fname)
        if os.path.isfile(fpath):
            zf.write(fpath, fname)
            print(f"  + {fname}")

buf.seek(0)
lam.update_function_code(
    FunctionName='joboss-applications',
    ZipFile=buf.read(),
)
print("Lambda deployed successfully.")
