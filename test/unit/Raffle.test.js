
const{ethers, deployments,network} = require("hardhat")
const {assert,expect} = require("chai")
const {developmentChains, networkConfig} = require("../../helper-hardhat-config")

!developmentChains.includes(network.name) ? describe.skip
: describe("Raffle unit testing", function(){

let vrfCoordinatorV2, raffleContract, raffle, raffleEntranceFee, interval, chainId

    beforeEach(async()=>{

       
    accounts = await ethers.getSigners()
    player = accounts[1]
    
    await deployments.fixture(["mocks","raffle"])
    vrfCoordinatorV2 = await ethers.getContract("VRFCoordinatorV2Mock")
    raffleContract = await ethers.getContract("Raffle")
    raffle = raffleContract.connect(player)
    raffleEntranceFee = await raffleContract.getEntranceFee()
    interval = await raffleContract.getInterval()
    chainId = network.config.chainId
    })

    describe("constructor", function(){

    it("initializes the raffle correctly", async ()=> {
    const raffleState = (await raffleContract.getRaffleState()).toString();
    assert.equal(raffleState.toString(),"0")
    assert.equal(interval.toString(),(networkConfig[chainId]["keepersUpdateInterval"]).toString())
    assert.equal(raffleEntranceFee.toString(),networkConfig[chainId]["raffleEntranceFee"].toString())
    })
    
    
    })  

    describe("enterRaffle",function(){
        it("reverts when you don't pay enough ETH", async ()=>{
        await expect(raffleContract.enterRaffle()).to.be.revertedWith("You need to deposite some more ETH")
        })

        it("add players to the list", async ()=> {
            await raffleContract.enterRaffle({value: raffleEntranceFee})
            const numOfPlayers = await raffleContract.getNumOfPlayers()
            assert.equal(numOfPlayers,1)
        })

        it("it pushes player in array", async () => {
            await raffle.enterRaffle({value: raffleEntranceFee})
            const playerAtIndex = await raffle.getPlayers(0)
            assert.equal(playerAtIndex,player.address)
        })

        it("emits an event", async() => {
            await expect(raffle.enterRaffle({value: raffleEntranceFee})).to.emit(raffle,"RaffleEnter")
            
        })

        it("gives error when raffle is in calculating state",async()=>{
            await raffle.enterRaffle({value: raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.request({ method: "evm_mine", params: [] })

            await raffle.performUpkeep([])
            await expect(raffle.enterRaffle({value: raffleEntranceFee})).to.be.revertedWith("Raffle__raffleNotOpen")
        })
    })

    describe("checkUpkeep", function(){
        it("return false when people doesn't send ETH", async () => {
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.request({ method: "evm_mine", params: [] })
            const { upkeepNeeded } = await raffleContract.callStatic.checkUpkeep("0x")
            assert(!upkeepNeeded)

        })

        it("return false when raffle is not open", async () => {
            await raffle.enterRaffle({value: raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.request({ method: "evm_mine", params: [] }) 
            await raffle.performUpkeep([])
            const { upkeepNeeded } = await raffleContract.callStatic.checkUpkeep("0x")
            assert(!upkeepNeeded)

        })

        it("return false when enough time is not passed", async () => {
            await raffle.enterRaffle({value: raffleEntranceFee})
            const { upkeepNeeded } = await raffleContract.callStatic.checkUpkeep("0x")
            assert(!upkeepNeeded)
        })

        it("return true if everything is true",async ()=>{
            await raffle.enterRaffle({value: raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.request({ method: "evm_mine", params: [] })
            const { upkeepNeeded } = await raffleContract.callStatic.checkUpkeep("0x")
            assert(upkeepNeeded)
        })
    })

    describe("performUpKeep", function(){
    it("perform only if checkupKeep is true",async()=>{
        await raffle.enterRaffle({value: raffleEntranceFee})
        await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
        await network.provider.request({ method: "evm_mine", params: [] })
        const tx = raffleContract.performUpkeep("0x")
        assert(tx)
    }) 
    
    it("reverts if checkupKeep is false", async() => {
        await expect(raffleContract.performUpkeep("0x")).to.be.revertedWith("Raffle__UpkkepNotNeeded")
    })

    it("updates the raffle state and gives request Id", async() => {
        await raffleContract.enterRaffle({value: raffleEntranceFee})
        await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
        await network.provider.request({ method: "evm_mine", params: [] })
        const txResponse = await raffleContract.performUpkeep("0x")
        const txReceipt = await txResponse.wait(1)
        const raffleState = await raffleContract.getRaffleState()
        const requestId = txReceipt.events[1].args.requestId
        assert(raffleState, 1)
        assert(requestId > 0)
        
    })
    })

    describe("fulfillRandomWords", function(){
        beforeEach(async()=>{
            await raffle.enterRaffle({value: raffleEntranceFee})
            await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
            await network.provider.request({ method: "evm_mine", params: [] })
        })

        it("can only be called after performUpKeep",async ()=>{
            await expect(vrfCoordinatorV2.fulfillRandomWords(0,raffle.address)).to.be.revertedWith("nonexistent request")
            await expect(vrfCoordinatorV2.fulfillRandomWords(1,raffle.address)).to.be.revertedWith("nonexistent request")
        })

        it("Picks winner,reset raffle and send money",async()=>{
            const additionalEntrance = 3
            const startingIndex = 2
            for(i = startingIndex; i < startingIndex+additionalEntrance; i++){
                
                raffle = raffleContract.connect(accounts[i])
                await raffle.enterRaffle({value: raffleEntranceFee})
            }

            const startingTimeStamp = await raffle.getLastTimeStamp()

            await new Promise(async (resolve, reject) => {
                raffle.once("WinnerPicked",async() =>{
                console.log("event fired................")
               
                try{const recentWinner = await raffle.getRecentWinner()
                    console.log(recentWinner)
                    console.log(accounts[0].address)
                    console.log(accounts[1].address)
                    console.log(accounts[2].address)
                    console.log(accounts[3].address)
                    console.log(accounts[4].address)
                const endingTimeStamp = await raffle.getLastTimeStamp()
                const raffleState = await raffle.getRaffleState()
                const winnerBalance = await accounts[2].getBalance()
                // await expect(raffle.getPlayers(0)).to.be.reverted

                assert.equal(raffleState, 0)
                assert(endingTimeStamp> startingTimeStamp)
                assert.equal(recentWinner,accounts[2].address)
                assert.equal(winnerBalance.toString(), startingBalance.add(raffleEntranceFee.mul(4)).toString())
                resolve()}
                catch(e)
                {reject(e)}

               
                

                })
                const txResponse = await raffle.performUpkeep("0x")
                const txReceipt = await txResponse.wait(1)
                const startingBalance = await accounts[2].getBalance()
                await vrfCoordinatorV2.fulfillRandomWords(txReceipt.events[1].args.requestId,raffle.address)
            })
        })
    })
    })
