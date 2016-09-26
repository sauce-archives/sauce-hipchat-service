FROM node:6.4.0
MAINTAINER Gavin Mogan <gavin@saucelabs.com>
EXPOSE 3000
ENV NODE_ENV=production
ENV AC_LOCAL_BASE_URL=https://sauce-for-hipchat.saucelabs.com

ADD package.json /tmp/package.json
RUN cd /tmp && npm install
RUN mkdir -p /usr/src/app && cp -a /tmp/node_modules /usr/src/app

WORKDIR /usr/src/app
COPY .babelrc .eslintrc *.js atlassian-connect.json config.json package.json /usr/src/app/
COPY lib/ /usr/src/app/lib/
COPY public/ /usr/src/app/public/
COPY views/ /usr/src/app/views/
RUN npm install --only=dev && $(npm bin)/webpack --config=webpack.config.js -p
#RUN npm test
RUN npm prune --production
CMD npm run start

