# FreeEgg AI Gateway —— 零依赖，Node 直接执行 TypeScript
FROM node:24-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8841 \
    PRANK_THINK_MS=13000 \
    PRANK_ASCII_WIDTH=68 \
    PRANK_ASCII_MODE=mono \
    PRANK_TOOLCALL=auto

WORKDIR /app

# 运行时只需要 package.json + src + assets：没有 dependencies，也没有构建步骤
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node assets ./assets

EXPOSE 8841

HEALTHCHECK --interval=30s --timeout=3s --start-period=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8841)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
CMD ["node", "src/index.ts"]
