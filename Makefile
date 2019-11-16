.PHONY: default build deploy run

default: run

build:
	npm run-script build

deploy:
	git push heroku master:master

run:
	npx ts-node src/index.ts
