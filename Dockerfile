FROM node:lts-alpine

RUN apk add --no-cache tini

ENV NODE_ENV production

RUN npm install -g pnpm@9

USER node

WORKDIR /app

COPY --chown=node:node . ./

RUN pnpm install --frozen-lockfile --prod

EXPOSE 3000

CMD [ "/sbin/tini", "--", "node", "app.js" ]