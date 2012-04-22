DEPLOY_DIR = $(HOME)/Dropbox/Public/SolarSailor
SRC_DIR = .


.PHONY: deploy
deploy: deploy_dir
	cp -R $(SRC_DIR)/* $(DEPLOY_DIR)


.PHONY: deploy_dir
deploy_dir:
	@mkdir -p $(DEPLOY_DIR)


clean:
	@echo rm -rf $(DEPLOY_DIR)

