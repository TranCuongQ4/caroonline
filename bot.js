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
        firebase.database().ref('rooms/' + roomId).once('value', snap => {
            const room = snap.val();
            if(!room || room.status !== 'playing') {
                // Nếu trận đấu bị hủy hoặc kết thúc, reset trận mới tức thì
                const idx = roomId.replace('room_','');
                resetBotVersusRoom(parseInt(idx));
                return;
            }

            let movesArr = room.moves ? room.moves.split(';') : [];
            const botRole = room.turn; // 'p1' hoặc 'p2'
            
            // AI tính toán nước đi giả lập
            const aiMove = computeAdvancedAIMinimax(movesArr, botRole);
            movesArr.push(`${aiMove.r},${aiMove.c},${botRole}`);
            const updatedMovesStr = movesArr.filter(Boolean).join(';');
            
            // Kiểm tra xem nước đi này Bot có thắng luôn không
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
            // Lặp lại chu kỳ nước đi ngẫu nhiên từ 4s đến 10s cho giống người thật
            runBotVersusLoop(roomId);
        });
    }, Math.floor(4000 + Math.random() * 6000));
}

// KÍCH HOẠT BOT KHI NGƯỜI CHƠI THẬT ĐẤU VỚI MÁY (KHI PHÒNG TRỐNG CHƯA AI VÀO)
function triggerBotAIMove(roomId, movesArr) {
    // Trì hoãn thời gian suy nghĩ ngẫu nhiên giả lập tâm lý từ 4 đến 10 giây
    const delay = Math.floor(4000 + Math.random() * 6000);
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

    // Nếu bàn cờ trống rỗng, Bot hạ ngay ô trung tâm bàn cờ ảo
    if(movesArr.length === 0 || movesArr[0] === "") {
        return { r: 40, c: 40 };
    }

    let bestScore = -1;
    let bestMove = null;
    const searchRange = 2; // Quét phạm vi lân cận xung quanh các quân đã hạ để tối ưu hóa hiệu năng

    // Quét tìm tất cả các ứng viên ô trống tiềm năng xung quanh các nước đi hiện tại
    for(let r = 2; r < 78; r++) {
        for(let c = 2; c < 78; c++) {
            if(grid[`${r}_${c}`]) continue; // Ô đã có quân, bỏ qua

            // Chỉ tính toán nếu ô này nằm gần một quân cờ bất kỳ để tránh lãng phí CPU
            let nearPiece = false;
            for(let dr = -searchRange; dr <= searchRange; dr++) {
                for(let dc = -searchRange; dc <= searchRange; dc++) {
                    if(grid[`${r+dr}_${c+dc}`]) { nearPiece = true; break; }
                }
                if(nearPiece) break;
            }

            if(!nearPiece) continue;

            // ĐÁNH GIÁ THẾ TRẬN: Cộng điểm tấn công và điểm phòng thủ chặn đòn đối phương
            const attackScore = evaluateCellForRole(r, c, botRole, grid);
            const defenseScore = evaluateCellForRole(r, c, enemyRole, grid);
            
            // Ưu tiên chặn đòn chí mạng của địch cao hơn tấn công thông thường một chút
            const finalScore = attackScore + (defenseScore * 1.1);

            if(finalScore > bestScore) {
                bestScore = finalScore;
                bestMove = { r: r, c: c };
            }
        }
    }

    // Nếu không tìm thấy nước tối ưu, hạ ngẫu nhiên sát một quân cờ bất kỳ
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

        // Quét về phía trước
        let rr = r + dr, cc = c + dc;
        while(grid[`${rr}_${cc}`] === role) { count++; rr += dr; cc += dc; }
        if(!grid[`${rr}_${cc}`]) openEnds++; // Đầu trống

        // Quét về phía sau
        rr = r - dr; cc = c - dc;
        while(grid[`${rr}_${cc}`] === role) { count++; rr -= dr; cc -= dc; }
        if(!grid[`${rr}_${cc}`]) openEnds++; // Đuôi trống

        // BẢNG CHẤM ĐIỂM THẾ TRẬN CARO VIỆT NAM
        if(count >= 4) {
            totalScore += (openEnds === 2) ? 10000 : 5000; // Sắp thành 5 quân liên tiếp
        } else if(count === 3) {
            totalScore += (openEnds === 2) ? 2000 : 500;  // Tạo thế 4 quân thoáng
        } else if(count === 2) {
            totalScore += (openEnds === 2) ? 400 : 100;
        } else if(count === 1) {
            totalScore += 10;
        }
    }
    return totalScore;
}