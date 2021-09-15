import { Signer } from '@ethersproject/abstract-signer';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { constants, Contract, ContractFactory, utils } from 'ethers';
import { deployMockContract, MockContract } from 'ethereum-waffle';
import hardhat from 'hardhat';

const { AddressZero, MaxUint256 } = constants;
const { parseEther: toWei } = utils;

const debug = require('debug')('ptv3:PrizePool.test');

describe('StakePrizePool', function () {
  let wallet: SignerWithAddress;
  let wallet2: SignerWithAddress;

  let prizePool: Contract;
  let erc20token: MockContract;
  let erc721token: MockContract;
  let stakeToken: Contract;

  let ticket: Contract;

  let StakePrizePool: ContractFactory;

  let initializeTxPromise;

  const initializeStakePrizePool = async (stakeTokenAddress: string) => {
    return await prizePool['initialize(address[],address)'](
      [ticket.address],
      stakeTokenAddress,
    );
  };

  beforeEach(async () => {
    [wallet, wallet2] = await hardhat.ethers.getSigners();
    debug(`using wallet ${wallet.address}`);

    debug('mocking tokens...');
    const IERC20 = await hardhat.artifacts.readArtifact('IERC20Upgradeable');
    erc20token = await deployMockContract(wallet as Signer, IERC20.abi);

    const IERC721 = await hardhat.artifacts.readArtifact('IERC721Upgradeable');
    erc721token = await deployMockContract(wallet as Signer, IERC721.abi);

    const ERC20Mintable = await hardhat.ethers.getContractFactory('ERC20Mintable');
    stakeToken = await ERC20Mintable.deploy('name', 'SSYMBOL');

    debug('deploying StakePrizePool...');
    StakePrizePool = await hardhat.ethers.getContractFactory('StakePrizePool', wallet);
    prizePool = await StakePrizePool.deploy();

    const Ticket = await hardhat.ethers.getContractFactory('Ticket');
    ticket = await Ticket.deploy();
    await ticket.initialize('name', 'SYMBOL', 18, prizePool.address);

    initializeTxPromise = await initializeStakePrizePool(stakeToken.address);

    await prizePool.setBalanceCap(ticket.address, MaxUint256);
  });

  describe('initialize()', () => {
    beforeEach(async () => {
      prizePool = await StakePrizePool.deploy();
    });

    it('should initialize StakePrizePool', async () => {
      initializeTxPromise = await initializeStakePrizePool(stakeToken.address);

      await expect(initializeTxPromise)
        .to.emit(prizePool, 'StakePrizePoolInitialized')
        .withArgs(stakeToken.address);
    });

    it('should fail to initialize StakePrizePool if stakeToken is address zero', async () => {
      await expect(initializeStakePrizePool(AddressZero)).to.be.revertedWith(
        'StakePrizePool/stake-token-not-zero-address',
      );
    });
  });

  describe('_redeem()', () => {
    it('should return amount staked', async () => {
      const amount = toWei('100');

      await stakeToken.approve(prizePool.address, amount);
      await stakeToken.mint(wallet.address, amount);

      await prizePool.depositTo(wallet.address, amount, ticket.address);

      await expect(prizePool.withdrawFrom(wallet.address, amount, ticket.address))
        .to.emit(prizePool, 'Withdrawal')
        .withArgs(wallet.address, wallet.address, ticket.address, amount, amount);
    });
  });

  describe('canAwardExternal()', () => {
    it('should not allow the stake award', async () => {
      expect(await prizePool.canAwardExternal(stakeToken.address)).to.be.false;
    });
  });

  describe('balance()', () => {
    it('should return the staked balance', async () => {
      const amount = toWei('100');

      await stakeToken.approve(prizePool.address, amount);
      await stakeToken.mint(wallet.address, amount);

      await prizePool.depositTo(wallet.address, amount, ticket.address);

      expect(await prizePool.callStatic.balance()).to.equal(amount);
    });
  });

  describe('_token()', () => {
    it('should return the staked token', async () => {
      expect(await prizePool.token()).to.equal(stakeToken.address);
    });
  });
});
