// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AutomationCompatibleInterface.sol";

error Raffle__raffleNotOpen();
error Raffle__UpkkepNotNeeded(uint256 currentBalance, uint256 players, uint256 raffleState);
error Raffle__TransferFailed();

contract Raffle is VRFConsumerBaseV2, AutomationCompatibleInterface {
    enum raffleState {
        OPEN,
        CALCULATING
    }

    raffleState private s_raffleState;
    uint256 private s_numOfPlayers;
    uint256 private immutable i_enteranceFee;
    address payable[] private s_players;
    uint256 private s_lastTimeStamp;
    address private s_recentWinner;
    uint256 private immutable i_interval;

    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    uint64 private immutable i_subId;
    bytes32 private immutable i_keyHash;
    uint32 private immutable i_callBackGasLimit;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS = 1;

    event RaffleEnter(address indexed player);
    event RequestedRaffleWinner(uint256 indexed requestId);
    event WinnerPicked(address recentWinner);

    constructor(
        uint256 _enteranceFee,
        address _vrfCoordinator,
        uint64 _subId,
        bytes32 _keyHash,
        uint32 _callBackGasLimit,
        uint256 _interval
    ) VRFConsumerBaseV2(_vrfCoordinator) {
        i_enteranceFee = _enteranceFee;
        s_raffleState = raffleState.OPEN;
        i_vrfCoordinator = VRFCoordinatorV2Interface(_vrfCoordinator);
        i_subId = _subId;
        i_keyHash = _keyHash;
        i_callBackGasLimit = _callBackGasLimit;
        s_lastTimeStamp = block.timestamp;
        i_interval = _interval;
    }

    modifier isRaffleOpen() {
        if (s_raffleState != raffleState.OPEN) {
            revert Raffle__raffleNotOpen();
        }
        _;
    }

    function enterRaffle() public payable isRaffleOpen {
        require(msg.value >= i_enteranceFee, "You need to deposite some more ETH");
        s_numOfPlayers++;
        s_players.push(payable(msg.sender));

        emit RaffleEnter(msg.sender);
    }

    function checkUpkeep(
        bytes memory /*checkData*/
    ) public view override returns (bool upkeepNeeded, bytes memory /*performData*/) {
        bool isOpen = (s_raffleState == raffleState.OPEN);
        bool isTimePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        bool hasPlayer = s_players.length > 0;
        bool hasBalance = address(this).balance > 0;

        upkeepNeeded = (isOpen && isTimePassed && hasPlayer && hasBalance);
        return (upkeepNeeded, "0x0");
    }

    function performUpkeep(bytes memory /*performData*/) external override {
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Raffle__UpkkepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_raffleState)
            );
        }
        s_raffleState = raffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_keyHash,
            i_subId,
            REQUEST_CONFIRMATIONS,
            i_callBackGasLimit,
            NUM_WORDS
        );

        emit RequestedRaffleWinner(requestId);
    }

    function fulfillRandomWords(
        uint256 /*requestId*/,
        uint256[] memory randomWords
    ) internal virtual override {
        uint256 recentWinnerIndex = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[recentWinnerIndex];
        s_recentWinner = recentWinner;
        s_lastTimeStamp = block.timestamp;
        s_raffleState = raffleState.OPEN;
        s_players = new address payable[](0);

        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if (!success) {
            revert Raffle__TransferFailed();
        }

        emit WinnerPicked(recentWinner);
    }

    function getRaffleState() public view returns (raffleState) {
        return s_raffleState;
    }

    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getNumOfPlayers() public view returns (uint256) {
        return s_numOfPlayers;
    }

    function getEntranceFee() public view returns (uint256) {
        return i_enteranceFee;
    }

    function getPlayers(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getLastTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }

    function getRequestConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS;
    }
}
