-include .env

.PHONY: build test deploy-testnet deploy-mainnet

build:
	forge build

test:
	forge test -v

test-gas:
	forge test --gas-report

deploy-testnet:
	forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast --verify

deploy-mainnet:
	forge script script/Deploy.s.sol --rpc-url arc_mainnet --broadcast --verify --slow

snapshot:
	forge snapshot

clean:
	forge clean
