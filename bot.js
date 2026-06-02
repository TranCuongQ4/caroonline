// KHO TÊN THUẦN VIỆT 100% HOÀN TOÀN TỰ NHIÊN GIỐNG NGƯỜI CHƠI THẬT
const FIRST_NAMES = ["Nguyễn ", "Trần ", "Lê ", "Phạm ", "Hoàng ", "Huỳnh ", "Phan ", "Vũ ", "Đặng ", "Bùi ", "Ngô ", "Dương ", "Lý "];
const MIDDLE_AND_LAST_NAMES = [
    "Thành Danh", "Minh Quân", "Tuấn Anh", "Khánh Linh", "Bảo Thy", "Hoàng Long", 
    "Thùy Dương", "Hải Đăng", "Phương Thảo", "Quốc Cường", "Thành Đạt", "Ánh Tuyết", 
    "Đức Phúc", "Hồng Nhung", "Tiến Dũng", "Kim Oanh", "Văn Nam", "Thu Trang", 
    "Gia Bảo", "Thanh Hải", "Trọng Nhân", "Hữu Phước", "Như Quỳnh", "Nhật Mai",
    "Hoàng Yến", "Minh Triết", "Quang Huy", "Thanh Trúc", "Đăng Khoa", "Tuyết Mai"
];

// Mảng đệm chứa danh sách tên sạch để đối chiếu
const ALL_PURE_VIET_NAMES = [];
(function generateAllBotNamesCache() {
    FIRST_NAMES.forEach(f => {
        MIDDLE_AND_LAST_NAMES.forEach(m => {
            ALL_PURE_VIET_NAMES.push(f + m);
        });
    });
})();

function getRandomPureVietName() {
    return ALL_PURE_VIET_NAMES[Math.floor(Math.random() * ALL_PURE_VIET_NAMES.length)];
}

// RESET GIẢ LẬP VÀ GHI ĐÈ TRỰC TIẾP TÊN THUẦN VIỆT LÊN FIREBASE ĐỂ LÀM SẠCH RÁC CŨ
function resetBotVersusRoom(roomIndex) {
    const b1 = getRandomPureVietName();
    const b2 = getRandomPureVietName();
    const roomId = 'room_' + roomIndex;

    firebase.database().ref('rooms/' + roomId).set({
        status: 'playing',
        p1: b1,
        p2: b2,
        turn: 'p1',
        moves: '',
        timer: 60
    }).then(() => {
        runBotVersusLoop(roomId);
    });
}

// VÒNG LẶP CHO 2 BOT TỰ CHƠI Ở CÁC PHÒNG ĐẦU TIÊN ĐỂ TẠO KHÔNG KHÍ SÔI ĐỘNG
function runBotVersusLoop(roomId) {
    setTimeout(() => {
        if (currentRoomId !== roomId) return; 
        
        firebase.database().ref('rooms/' + roomId).once('value', snap => {
            const room = snap.val();
            if(!room || room.status !== 'playing') {
                const idx = roomId.replace('room_','');
                resetBotVersusRoom(parseInt(idx));
                return;
            }

            let movesArr = room.moves ? room.moves.split(';') : [];
            const botRole = room.turn; 
            
            const aiMove = computeAdvancedAIMinimax(movesArr, botRole);
            movesArr.push(`${aiMove.r},${aiMove.c},${botRole}`);
            const updatedMovesStr = movesArr.filter(Boolean).join(';');
            
            const isWin = checkWinCondition(aiMove.r, aiMove.c, botRole, movesArr);
            
            if(isWin || movesArr.length >= 250) { 
                firebase.database().ref('rooms/' + roomId).update({
                    moves: updatedMovesStr,
                    status: 'ended'
                });
            } else {
                firebase.database().ref('rooms/' + roomId).update({
                    moves: updatedMovesStr,
                    turn: botRole === 'p1' ? 'p2' : 'p1',
                    timer: 60
                });
            }
            runBotVersusLoop(roomId);
        });
    }, Math.floor(2000 + Math.random() * 2000)); 
}

// BOT TỰ ĐỘNG GHÉP VÀO PHÒNG KHI NGƯỜI THẬT CHỜ QUÁ 5 GIÂY NGOÀI SẢNH MÀ KHÔNG CÓ AI VÀO
function checkAndTriggerFakePlayerBot(roomId) {
    firebase.database().ref('rooms/' + roomId).once('value', snap => {
        const room = snap.val();
        if(room && room.status === 'waiting' && (!room.p2 || room.p2 === '')) {
            const fakePlayerName = getRandomPureVietName(); 
            
            firebase.database().ref('rooms/' + roomId).update({
                p2: fakePlayerName,
                status: 'playing',
                timer: 60
            });
        }
    });
}

// ĐI QUÂN CỦA BOT KHI ĐANG THI ĐẤU TRỰC TIẾP VỚI NGƯỜI CHƠI THẬT
function triggerBotAIMove(roomId, movesArr) {
    const delay = Math.floor(1500 + Math.random() * 1500); 
    setTimeout(() => {
        firebase.database().ref('rooms/' + roomId).once('value', snap => {
            const room = snap.val();
            if(!room || room.status !== 'playing' || room.turn !== 'p2') return;

            let currentMoves = room.moves ? room.moves.split(';') : [];
            const aiMove = computeAdvancedAIMinimax(currentMoves, 'p2');
            currentMoves.push(`${aiMove.r},${aiMove.c},p2`);
            
            const updatedMovesStr = currentMoves.filter(Boolean).join(';');
            const isWin = checkWinCondition(aiMove.r, aiMove.c, 'p2', currentMoves);

            if(isWin) {
                firebase.database().ref('rooms/' + roomId).update({
                    moves: updatedMovesStr, status: 'ended', timer: 60
                });
            } else {
                firebase.database().ref('rooms/' + roomId).update({
                    moves: updatedMovesStr, turn: 'p1', timer: 60
                });
            }
        });
    }, delay);
}

// THUẬT TOÁN AI CHẤM ĐIỂM ĐI QUÂN MINIMAX
function computeAdvancedAIMinimax(movesArr, botRole) {
    const grid = {};
    const enemyRole = (botRole === 'p1') ? 'p2' : 'p1';
    
    movesArr.forEach(m => {
        if(!m) return;
        const [r, c, role] = m.split(',');
        grid[`${r}_${c}`] = role;
    });

    if(movesArr.length === 0 || movesArr[0] === "") {
        return { r: 40, c: 40 };
    }

    let bestScore = -1;
    let bestMove = null;
    const searchRange = 2; 

    for(let r = 2; r < 78; r++) {
        for(let c = 2; c < 78; c++) {
            if(grid[`${r}_${c}`]) continue; 

            let nearPiece = false;
            for(let dr = -searchRange; dr <= searchRange; dr++) {
                for(let dc = -searchRange; dc <= searchRange; dc++) {
                    if(grid[`${r+dr}_${c+dc}`]) { nearPiece = true; break; }
                }
                if(nearPiece) break;
            }

            if(!nearPiece) continue;

            const attackScore = evaluateCellForRole(r, c, botRole, grid);
            const defenseScore = evaluateCellForRole(r, c, enemyRole, grid);
            
            const finalScore = attackScore + (defenseScore * 1.3);

            if(finalScore > bestScore) {
                bestScore = finalScore;
                bestMove = { r: r, c: c };
            }
        }
    }

    if(!bestMove) {
        const firstMove = movesArr[0].split(',');
        return { r: parseInt(firstMove[0]) + 1, c: parseInt(firstMove[1]) };
    }

    return bestMove;
}

// ĐÁNH GIÁ THẾ CỜ CHO AI ĐI QUÂN KHÔN NGOAN
function evaluateCellForRole(r, c, role, grid) {
    const directions = [[0,1], [1,0], [1,1], [1,-1]];
    let totalScore = 0;

    for(let [dr, dc] of directions) {
        let count = 0;
        let openEnds = 0;

        let rr = r + dr, cc = c + dc;
        while(grid[`${rr}_${cc}`] === role) { count++; rr += dr; cc += dc; }
        if(!grid[`${rr}_${cc}`]) openEnds++; 

        rr = r - dr; cc = c - dc;
        while(grid[`${rr}_${cc}`] === role) { count++; rr -= dr; cc -= dc; }
        if(!grid[`${rr}_${cc}`]) openEnds++; 

        if(count >= 4) {
            totalScore += (openEnds === 2) ? 15000 : 8000; 
        } else if(count === 3) {
            totalScore += (openEnds === 2) ? 4000 : 1000;  
        } else if(count === 2) {
            totalScore += (openEnds === 2) ? 600 : 200;
        } else if(count === 1) {
            totalScore += 20;
        }
    }
    return totalScore;
}