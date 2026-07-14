import os
import shutil
import subprocess

# Paths
base_dir = '/home/pi/Downloads/CERTIOS.XYZ/server/scratch'
ipa_path = '/home/pi/Downloads/CERTIOS.XYZ/server/templates/ESign_v1.ipa'
extract_dir = os.path.join(base_dir, 'esign_v2_work')
template_out = '/home/pi/Downloads/CERTIOS.XYZ/server/templates/ESign_CERTIOS_TEMPLATE.ipa'

if os.path.exists(extract_dir):
    shutil.rmtree(extract_dir)
os.makedirs(extract_dir)

subprocess.run(['unzip', '-q', ipa_path, '-d', extract_dir], check=True)

# 1. Patch binary
binary_path = os.path.join(extract_dir, 'Payload/ESign.app/ESign')
with open(binary_path, 'rb') as f:
    data = f.read()

replacements = {
    b"https://khoindvn.io.vn": b"https://cuios.shop" + b"\x00" * 4,
    b"https://api.khoindvn.io.vn/discord": b"https://t.me/chungchicuios" + b"\x00" * 8,
    b"https://api.khoindvn.io.vn/tele": b"https://t.me/chungchicuios" + b"\x00" * 5,
    b"khoindvn.backloop.dev": b"certios.backloop.dev\x00",
    b"https://khoindvn.backloop.dev:": b"https://certios.backloop.dev:\x00"
}

patched_data = data
for old_str, new_str in replacements.items():
    if len(new_str) != len(old_str):
        print(f"Error: length mismatch! Old: {len(old_str)}, New: {len(new_str)}")
    patched_data = patched_data.replace(old_str, new_str)

with open(binary_path, 'wb') as f:
    f.write(patched_data)

# 2. Fix repo.txt
repo_txt_path = os.path.join(extract_dir, 'Payload/ESign.app/repo.txt')
with open(repo_txt_path, 'w') as f:
    f.write('https://certios.xyz/apps.json')

# 3. Clean signing-assets
signing_assets_dir = os.path.join(extract_dir, 'Payload/ESign.app/signing-assets/khoindvn.io.vn')
if os.path.exists(signing_assets_dir):
    shutil.rmtree(signing_assets_dir)

# Ensure cuios.shop signing asset path exists
cuios_assets = os.path.join(extract_dir, 'Payload/ESign.app/signing-assets/cuios.shop')
os.makedirs(cuios_assets, exist_ok=True)

# 4. Restore splash screen
nib_path = os.path.join(extract_dir, 'Payload/ESign.app/Base.lproj/LaunchScreen.storyboardc/01J-lp-oVM-view-Ze5-6b-2t3.nib')
subprocess.run(['sed', '-i', 's/app_logo_/icon-1024/g', nib_path], check=True)

# 5. Fix icons
os.system(f'wget -q https://vsacheat.com/img/esign.png -O {extract_dir}/icon.png')
os.system(f'cp {extract_dir}/icon.png {extract_dir}/Payload/ESign.app/AppIcon60x60@2x.png')
os.system(f'cp {extract_dir}/icon.png {extract_dir}/Payload/ESign.app/AppIcon76x76@2x~ipad.png')
os.system(f'rm {extract_dir}/icon.png')

# 6. Repack
subprocess.run(f'cd {extract_dir} && zip -qr {template_out} Payload', shell=True, check=True)
print("Done patching template!")
