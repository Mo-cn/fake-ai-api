/**
 * 检查 GHCR 镜像是否匿名可拉取，以及 GitHub Pages 是否在线。
 *   node tools/ghcrcheck.ts [owner/repo]
 */
const SLUG = process.argv[2] || 'mo-cn/fake-ai-api';
const OWNER = SLUG.split('/')[0];
const NAME = SLUG.split('/')[1];

async function main(): Promise<void> {
  console.log('=== GHCR 匿名访问 ===');
  try {
    const info = await fetch('https://api.github.com/users/' + OWNER + '/packages/container/' + NAME, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'freeegg-check' },
    });
    console.log('包信息接口  : HTTP ' + info.status + (info.ok ? '（公开）' : '（非公开或需要 read:packages）'));
  } catch (e) {
    console.log('包信息接口  : ' + String((e as Error).message).slice(0, 100));
  }

  try {
    const t = await fetch('https://ghcr.io/token?scope=repository:' + SLUG + ':pull&service=ghcr.io');
    const tj = await t.json() as { token: string };
    const m = await fetch('https://ghcr.io/v2/' + SLUG + '/manifests/latest', {
      headers: {
        authorization: 'Bearer ' + tj.token,
        accept: 'application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.docker.distribution.manifest.v2+json',
      },
    });
    console.log('匿名拉取    : HTTP ' + m.status);
    if (m.ok) {
      const mj = await m.json() as { mediaType: string; manifests?: Array<{ platform?: { os?: string; architecture?: string } }> };
      console.log('清单类型    : ' + mj.mediaType);
      console.log('平台        : ' + (mj.manifests || []).map((x) => (x.platform?.os || '?') + '/' + (x.platform?.architecture || '?')).join(', '));
      console.log('digest      : ' + m.headers.get('docker-content-digest'));
    }
  } catch (e) {
    console.log('匿名拉取    : ' + String((e as Error).message).slice(0, 100));
  }

  console.log('=== GitHub Pages ===');
  const p = await fetch('https://' + OWNER + '.github.io/' + NAME + '/');
  const html = await p.text();
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '(无)';
  console.log('首页        : HTTP ' + p.status + '  ' + html.length + ' 字节  title=' + title);
  for (const f of ['portal.png', 'markdown-fix.png']) {
    const r = await fetch('https://' + OWNER + '.github.io/' + NAME + '/' + f);
    console.log('  ' + f.padEnd(18) + ': HTTP ' + r.status + '  ' + r.headers.get('content-type'));
  }
}

main();
