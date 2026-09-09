set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

install:
    npm install

dev:
    npx wrangler dev

check:
    npm run check

test:
    npm test

verify: check test
