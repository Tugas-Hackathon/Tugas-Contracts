// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Proof-of-Learning ledger for Tugas. Stores only hashes; never content.
contract LearningLedger {
    struct Commit {
        address student;
        bytes32 workHash;      // keccak256 of the student's normalised draft
        bytes32 contextHash;   // keccak256 of brief + "\n" + rubric
        uint8 aiAssistLevel;   // 0-100, self-declared
        uint64 timestamp;
        uint32 endorsements;
    }

    event MilestoneCommitted(
        address indexed student,
        uint256 indexed id,
        bytes32 workHash,
        bytes32 contextHash,
        uint8 aiAssistLevel,
        uint64 timestamp
    );
    event Endorsed(uint256 indexed id, address indexed endorser);

    Commit[] private commits;
    mapping(address => uint256[]) private studentCommits;
    mapping(uint256 => mapping(address => bool)) public endorsed;

    function commit(bytes32 workHash, bytes32 contextHash, uint8 aiAssistLevel)
        external
        returns (uint256 id)
    {
        require(aiAssistLevel <= 100, "level>100");
        require(workHash != bytes32(0), "zero hash");
        id = commits.length;
        commits.push(Commit(msg.sender, workHash, contextHash, aiAssistLevel, uint64(block.timestamp), 0));
        studentCommits[msg.sender].push(id);
        emit MilestoneCommitted(msg.sender, id, workHash, contextHash, aiAssistLevel, uint64(block.timestamp));
    }

    function getCommit(uint256 id) external view returns (Commit memory) {
        require(id < commits.length, "no commit");
        return commits[id];
    }

    function commitsOf(address student) external view returns (uint256[] memory) {
        return studentCommits[student];
    }

    function totalCommits() external view returns (uint256) {
        return commits.length;
    }
}
