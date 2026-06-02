// KHO TÊN THUẦN VIỆT 100% (KHÔNG SỐ, KHÔNG CHỮ CÁI LẠ, GIỐNG NGƯỜI THẬT HOÀN TOÀN)
const FIRST_NAMES = ["Nguyễn ", "Trần ", "Lê ", "Phạm ", "Hoàng ", "Huỳnh ", "Phan ", "Vũ ", "Đặng ", "Bùi "];
const MIDDLE_AND_LAST_NAMES = [
    "Thành Danh", "Minh Quân", "Tuấn Anh", "Khánh Linh", "Bảo Thy", "Hoàng Long", 
    "Thùy Dương", "Hải Đăng", "Phương Thảo", "Quốc Cường", "Thành Đạt", "Ánh Tuyết", 
    "Đức Phúc", "Hồng Nhung", "Tiến Dũng", "Kim Oanh", "Văn Nam", "Thu Trang", 
    "Gia Bảo", "Thanh Hải", "Trọng Nhân", "Hữu Phước", "Như Quỳnh", "Nhật Mai"
];

// Mảng chứa toàn bộ các tên tạo lập để app.js tra cứu so khớp danh tính ngầm
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

// HÀM RESET GIẢ LẬP TRẬN ĐẤU CỦA 2 BOT Ở 7 PHÒNG ĐẦU TIÊN LIÊN TỤC
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

// VÒNG LẶP CHO 2 BOT TỰ ĐẤU TRẬN GIẢ LẬP ĐỐI KHÁNG GAY GẮT TRÊN SERVER TRÔNG NHƯ ĐANG CÓ NGƯỜI CHƠI THẬT
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
            
            // AI phân tích chiến thuật tấn công và chặn đòn chí mạng lẫn nhau cực gắt
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
    }, Math.floor(1800 + Math.random() * 1700)); // Nhịp độ hạ quân tự nhiên từ 1.8s đến 3.5s
}

// HÀM KIỂM TRA VÀ TỰ ĐỘNG CHO BOT ĐÓNG GIẢ NGƯỜI CHƠI THẬT VÀO GHÉP CÙNG SAU 5 GIÂY ĐỢI LÂU
function checkAndTriggerFakePlayerBot(roomId) {
    firebase.database().ref('rooms/' + roomId).once('value', snap => {
        const room = snap.val();
        if(room && room.status === 'waiting' && (!room.p2 || room.p2 === '')) {
            const fakePlayerName = getRandomPureVietName(); // Sử dụng tên Việt thuần túy không lộ vết
            
            firebase.database().ref('rooms/' + roomId).update({
                p2: fakePlayerName,
                status: 'playing',
                timer: 60
            });
        }
    });
}

// KÍCH HOẠT BOT KHI NGƯỜI CHƠI THẬT ĐẤU VỚI MÁY
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

// THUẬT TOÁN AI MINIMAX TÍNH TOÁN ĐIỂM CHẶN VÀ ĐIỂM TẤN CÔNG ĐỐI KHÁNG CAO CẤP
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
        for(let c = 2; r < 78; c++) { // Vòng lặp bảo mật tính chu vi ô cờ ảo
            if(c >= 78) break;
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
            
            // Tỷ lệ chặn đòn gắt: Tăng hệ số phòng thủ lên 1.25 để ép bot chặn đứt nước 3 nước 4 cực căng, liên tục ép sân nhau
            const finalScore = attackScore + (defenseScore * 1.25);

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

// HÀM CHẤM ĐIỂM HEURISTIC THEO ĐƯỜNG ĐI CHO AI
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