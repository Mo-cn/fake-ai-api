/**
 * 入口：读取配置、启动服务、打印启动横幅。
 *   node src/index.ts
 */
import { loadConfig } from './config.ts';
import { createApp } from './server.ts';
import { art } from './core/script.ts';
import * as models from './core/models.ts';

const cfg = loadConfig(process.env);
const app = createApp(cfg);

app.server.listen(cfg.port, cfg.host, () => {
  const line = '='.repeat(66);
  const base = 'http://' + cfg.host + ':' + cfg.port;
  console.log(line);
  console.log('  ' + cfg.brand.product + '  ·  ' + cfg.brand.latin + '  ' + cfg.brand.version);
  console.log('  ' + cfg.brand.slogan);
  console.log(line);
  console.log('  门户        ' + base + '/');
  console.log('  Base URL    ' + base + '/v1');
  console.log('  模型         ' + models.MODEL_COUNT + ' 个 / ' + models.VENDORS.length + ' 家厂商');
  console.log('  假装思考     ' + (cfg.thinkMs / 1000).toFixed(1) + ' 秒（PRANK_THINK_MS，设 0 关闭）');
  console.log('  字符画       width=' + cfg.asciiWidth + ' mode=' + cfg.asciiMode + ' toolcall=' + cfg.toolMode);
  console.log('  鉴权         ' + (cfg.requireKey ? '已开启（密钥由设备码派生）' : '宽松模式（任意 sk- 均可）'));
  console.log(line);
  console.log('  OpenAI      POST /v1/chat/completions   GET /v1/models');
  console.log('  OpenAI      POST /v1/responses          POST /v1/completions');
  console.log('  Anthropic   POST /v1/messages           POST /v1/messages/count_tokens');
  console.log('  Gemini      POST /v1beta/models/{m}:generateContent');
  console.log('  Ollama      POST /api/chat              GET /api/tags');
  console.log('  设备密钥     POST /v1/device/register');
  console.log(line);
  console.log(art(cfg.bannerWidth, 'mono'));
  console.log(line);
});

const shutdown = (): void => {
  app.server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
