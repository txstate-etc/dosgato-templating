FROM node:16-alpine

WORKDIR /usr/app
RUN date +"%Y-%m-%dT%H:%M:%S%z" > /.builddate
