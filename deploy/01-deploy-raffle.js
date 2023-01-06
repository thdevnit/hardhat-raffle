const {network, ethers} = require("hardhat")
const { networkConfig, developmentChains, VERIFICATION_BLOCK_CONFIRMATIONS } = require("../helper-hardhat-config")

const {verify} = require("../utils/verify")

const Fund_Amount = ethers.utils.parseEther("1")
module.exports = async ({getNamedAccounts,deployments}) => {
    const {log,deploy} = deployments
    const {deployer} = await getNamedAccounts()
    const chainId = network.config.chainId

    let vrfCoordinatorV2Address, subscriptionId

    if(chainId == 31337){
        const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address
        const transactionResponse = await vrfCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transactionResponse.wait(1)
        subscriptionId = transactionReceipt.events[0].args.subId

        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId,Fund_Amount)
    }else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
        subscriptionId = networkConfig[chainId]["subscriptionId"]
    }

    const waitBlockConfirmations = developmentChains.includes(network.name) ? 1 : VERIFICATION_BLOCK_CONFIRMATIONS
    
    log ("Deploying..........................................")

    const args = [networkConfig[chainId]["raffleEntranceFee"],vrfCoordinatorV2Address,subscriptionId,networkConfig[chainId]["gasLane"],networkConfig[chainId]["callbackGasLimit"],networkConfig[chainId]["keepersUpdateInterval"]]

    const raffle = await deploy("Raffle",{
        from: deployer,
        log: true,
        args: args,
        waitConfirmations: waitBlockConfirmations,
    })

    log("Deployed.................")


    if (developmentChains.includes(network.name)) {
        const vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2Mock"
        );
        await vrfCoordinatorV2Mock.addConsumer(subscriptionId.toNumber(), raffle.address)
        log("adding consumer...")
        log("Consumer added!")
    }

    

    if(!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY){

        log("Verifying contract........................") 
        await verify(raffle.address,args)

    }


}

module.exports.tags = ["all","raffle"]