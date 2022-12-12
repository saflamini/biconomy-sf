const hre = require("hardhat");
const { Framework } = require("@superfluid-finance/sdk-core");
const { ethers } = require("hardhat");
const { Biconomy } = require("@biconomy/mexa");
require("dotenv").config();
const MoneyRouterABI = require("../artifacts/contracts/MoneyRouter.sol/MoneyRouter.json").abi;
const sigUtil = require("eth-sig-util");
const { AbiCoder } = require("ethers/lib/utils");
const cfaABI = require("./cfaABI");
const hostABI = require("./hostABI");


//to run this script:
//1) Make sure you've created your own .env file
//2) Make sure that you have your network and accounts specified in hardhat.config.js
//3) Make sure that you add the address of your own money router contract
//4) Make sure that you change the params in the aclApproval operation to reflect the proper values
//3) run: npx hardhat run scripts/aclApproval.js --network goerli
async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');


  const provider = new hre.ethers.providers.JsonRpcProvider(process.env.GOERLI_URL);


  const sf = await Framework.create({
    chainId: (await provider.getNetwork()).chainId,
    provider: provider
  });


  const daix = await sf.loadSuperToken("fDAIx");

  let mySigner = new ethers.Wallet(`0x${process.env.PRIVATE_KEY}`)

  console.log(mySigner.address)
  let biconomy = new Biconomy(provider, {
    apiKey: 'ieykFwRbY.0b9399ed-52ec-4f34-acb0-7798ea9e30ec',
    debug: true,
    contractAddresses: '0x22ff293e14F1EC3A09B137e9e06084AFd63adDF9',
  })

  biconomy.onEvent(biconomy.READY, async () => {


  const cfaInterface = new ethers.utils.Interface(cfaABI);
  const hostInterface = new ethers.utils.Interface(hostABI);

  const getTransactionDescription = (
    fragments,
    data,
  ) => {
    const iface = new ethers.utils.Interface(fragments);
    const txnDescription = iface.parseTransaction({ data });
    return txnDescription;
  };

  const getCallAgreementFunctionArgs = (callData) =>
    getTransactionDescription(hostABI, callData).args;


  const tx = cfaInterface.encodeFunctionData(
    "deleteFlow",
    [daix.address, mySigner.address, "0xaEFb2595E0681E16bBEB3FbA57dFA2CceA824A9A", "0x"]
);  

  // const operation = 

  const operation = sf.host.populateCallAgreementTxnAndReturnOperation(
    sf.settings.config.cfaV1Address,
    tx,
    "0x"
  )

  const populatedTransaction = await operation.populateTransactionPromise

  const functionArgs = getCallAgreementFunctionArgs(populatedTransaction.data)

  const d = ethers.utils.defaultAbiCoder.encode(
    ["bytes", "bytes"],
    [functionArgs["callData"], functionArgs["userData"]]
  )

  const officialOperation = {
    operationType: 201,
    target: functionArgs["agreementClass"],
    data: d
  }


  const baseTx = hostInterface.encodeFunctionData("forwardBatchCall",
    [[officialOperation]]
  )
  
  
  let rawTx = {
    to: '0x22ff293e14F1EC3A09B137e9e06084AFd63adDF9',
    data: baseTx,
    gasLimit: 2000000,
    from: mySigner.address
  }

  let signedTx = await mySigner.signTransaction(rawTx);

  let forwardData = await biconomy.getForwardRequestAndMessageToSign(signedTx);

  // console.log(forwardData)

  //note that the private key here cannot contain '0x'
  let signature = sigUtil.signTypedMessage(new Buffer.from(`0x${process.env.PRIVATE_KEY}`, 'hex'), {data: forwardData.eip712Format }, 'V3')

  let data = {
    signature: signature,
    forwardRequest: forwardData.request,
    rawTransaction: signedTx,
    signatureType: biconomy.EIP712_SIGN
  }

  let p = biconomy.getEthersProvider()
  let txHash = await p.send("eth_sendRawTransaction", [data]);

  let receipt = await p.waitForTransaction(txHash);

  console.log(receipt);
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});