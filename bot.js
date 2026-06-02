// HÀM RESET GIẢ LẬP TRẬN ĐẤU CỦA 2 BOT Ở BA PHÒNG ĐẦU TIÊN TIÊN LIÊN TỤC
function resetBotVersusRoom(roomIndex) {
    const b1 = "caro" + Math.floor(100000 + Math.random() * 900000);
    const b2 = "caro" + Math.floor(100000 + Math.random() * 900000);
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

// VÒNG LẶP CHO 2 BOT TỰ ĐẤU TRẬN GIẢ LẬP TRÊN SERVER CẢ NGÀY KHÔNG DỪNG
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
            
            if(isWin || movesArr.length >= 200) {
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

// HÀM KIỂM TRA VÀ TỰ ĐỘNG CHO BOT ĐÓNG GIẢ NGƯỜI CHƠI THẬT SAU 5 GIÂY ĐỢI LÂU
function checkAndTriggerFakePlayerBot(roomId) {
    firebase.database().ref('rooms/' + roomId).once('value', snap => {
        const room = snap.val();
        // Nếu phòng vẫn tồn tại, đang ở trạng thái 'waiting' và vị trí Player 2 thực sự vẫn trống
        if(room && room.status === 'waiting' && (!room.p2 || room.p2 === '')) {
            // Đặt tên Bot giống hệt người chơi thật để họ không phát hiện ra
            const fakePlayerName = "NgườiChơi_" + Math.floor(100000 + Math.random() * 900000);
            
            firebase.database().ref('rooms/' + roomId).update({
                p2: fakePlayerName,
                status: 'playing',
                timer: 60
            });
        }
    });
}

// KÍCH HOẠT BOT KHI NGƯỜI CHƠI THẬT ĐẤU VỚI MÁY (KHI ĐẾN LƯỢT ĐƯỜNG ĐI CỦA BOT)
function triggerBotAIMove(roomId, movesArr) {
    const delay = Math.floor(1500 + Math.random() * 1500); // Tốc độ phản hồi của Bot giả lập người từ 1.5s - 3s
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

// THUẬT TOÁN AI MINIMAX RÚT GỌN TÍNH TOÁN ĐIỂM CHẶN VÀ ĐIỂM TẤN CÔNG CAO CẤP
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
            const finalScore = attackScore + (defenseScore * 1.1);

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
            totalScore += (openEnds === 2) ? 10000 : 5000; 
        } else if(count === 3) {
            totalScore += (openEnds === 2) ? 2000 : 500;  
        } else if(count === 2) {
            totalScore += (openEnds === 2) ? 400 : 100;
        } else if(count === 1) {
            totalScore += 10;
        }
    }
    return totalScore;
}