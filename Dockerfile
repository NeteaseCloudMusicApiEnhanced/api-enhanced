FROM node:lts-alpine

RUN apk add --no-cache tini

ENV NODE_ENV=production

RUN npm install -g pnpm@9

USER node

WORKDIR /app

COPY --chown=node:node . ./

# --prod 模式下 husky 不会被安装，prepare 脚本会因找不到 husky 而失败，
# 故显式跳过生命周期脚本；本项目生产运行也不依赖任何 postinstall 步骤。
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

EXPOSE 3000

CMD [ "/sbin/tini", "--", "node", "app.js" ]