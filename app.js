// === CẤU HÌNH THÔNG SỐ VÀO ĐÂY ===
const firebaseConfig = {
    apiKey: "AIzaSyYOUR_API_KEY_HERE",
    authDomain: "your-app.firebaseapp.com",
    databaseURL: "https://cuongdata-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "your-app",
    storageBucket: "your-app.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234:web:1234"
};

// Khởi tạo kết nối với Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Biến trạng thái toàn cục của người chơi hiện tại
let myUsername = "caro" + Math.floor(100000 + Math.random() * 900000);
let currentRoomId = null;
let myRole = null; // 'p1' (Trắng), 'p2' (Đen), hoặc 'viewer' (Người xem)
let selectedPreviewMove = null; // Nước đi nhấp thử nhưng chưa bấm xác nhận
let gameCountdownInterval = null;
const BOARD_SIZE = 80; // Bản cờ ảo 80x80 ô để cuộn thoải mái

// Các phần tử DOM cần tương tác
const screenLobby = document.getElementById('screen-lobby');
const screenGame = document.getElementById('screen-game');
const roomListContainer = document.getElementById('room-list');
const boardCanvas = document.getElementById('board-canvas');
const boardWrapper = document.getElementById('board-wrapper');
const btnConfirmMove = document.getElementById('btn-confirm-move');

// CHẶN CHUỘT PHẢI
document.addEventListener('contextmenu', e => e.preventDefault());

// KHỞI ĐỘNG HỆ THỐNG
window.onload = function() {
    initLobbySystem();
    setupCanvasGrid();
    setupDragToScroll();
};

// DỰNG LƯỚI BÀN CỜ VÀ LẮNG NGHE SỰ KIỆN CLICK Ô CỜ
function setupCanvasGrid() {
    boardCanvas.innerHTML = '';
    for(let r=0; r<BOARD_SIZE; r++){
        for(let c=0; c<BOARD_SIZE; c++){
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.style.top = (r * 25) + 'px';
            cell.style.left = (c * 25) + 'px';
            cell.dataset.row = r;
            cell.dataset.col = c;
            cell.addEventListener('click', () => handleCellClick(r, c));
            boardCanvas.appendChild(cell);
        }
    }
}

// TÍNH NĂNG KÉO RÊ CHUỘT/TAY ĐỂ CUỘN BÀN CỜ VÔ HẠN
function setupDragToScroll() {
    let isDown = false; let startX, startY, scrollLeft, scrollTop;
    boardWrapper.addEventListener('mousedown', (e) => {
        if(e.target.classList.contains('cell') || e.target.classList.contains('piece')) return;
        isDown = true;
        startX = e.pageX - boardWrapper.offsetLeft;
        startY = e.pageY - boardWrapper.offsetTop;
        scrollLeft = boardWrapper.scrollLeft;
        scrollTop = boardWrapper.scrollTop;
    });
    boardWrapper.addEventListener('mouseleave', () => isDown = false);
    boardWrapper.addEventListener('mouseup', () => isDown = false);
    boardWrapper.addEventListener('mousemove', (e) => {
        if(!isDown) return;
        e.preventDefault();
        const x = e.pageX - boardWrapper.offsetLeft;
        const y = e.pageY - boardWrapper.offsetTop;
        boardWrapper.scrollLeft = scrollLeft - (x - startX);
        boardWrapper.scrollTop = scrollTop - (y - startY);
    });
}

// XỬ LÝ SẢNH CHỜ VÀ BA PHÒNG BOT "CHIM MỒI" MẶC ĐỊNH
function initLobbySystem() {
    // Luôn luôn tạo hoặc đồng bộ 3 phòng Bot chạy ngầm đầu tiên
    for (let i = 1; i <= 3; i++) {
        database.ref('rooms/room_' + i).once('value', snapshot => {
            if (!snapshot.exists()) {
                resetBotVersusRoom(i);
            }
        });
    }

    // Lắng nghe danh sách phòng từ Firebase truyền về sảnh
    database.ref('rooms').on('value', snapshot => {
        roomListContainer.innerHTML = '';
        const allRooms = snapshot.val() || {};
        
        // Luôn hiển thị danh sách từ phòng 1 trở đi sắp xếp chuyên nghiệp
        let index = 1;
        while(true) {
            let roomId = 'room_' + index;
            if (index > 3 && !allRooms[roomId]) {
                break; // Hết danh sách phòng tùy biến của người dùng
            }
            const room = allRooms[roomId] || { status: 'empty' };
            renderRoomCard(roomId, index, room);
            index++;
        }
    });

    // Sự kiện bấm nút Tạo Phòng
    document.getElementById('btn-create-room').onclick = function() {
        const pass = document.getElementById('input-room-pass').value.trim();
        database.ref('rooms').once('value', snap => {
            const data = snap.val() || {};
            let nextIndex = 4;
            while(data['room_' + nextIndex]) { nextIndex++; }
            
            const newRoomId = 'room_' + nextIndex;
            database.ref('rooms/' + newRoomId).set({
                status: 'waiting',
                pass: pass,
                p1: myUsername,
                p2: '',
                turn: 'p1',
                moves: '',
                timer: 60
            }).then(() => {
                joinGameRoom(newRoomId);
            });
        });
    };

    // Sự kiện nút hướng dẫn
    document.getElementById('btn-guide').onclick = function() {
        showModal("Hướng Dẫn", "Luật chơi: Đủ 5 quân liên tiếp theo hàng ngang, dọc hoặc chéo sẽ chiến thắng. Tuy nhiên nếu bị chặn TRỌN VẸN cả 2 đầu thì nước cờ đó không tính là thắng. Bạn có 60 giây đặt thử và ấn Xác Nhận để hoàn thành nước đi.");
    };
}

// RENDER THẺ PHÒNG NGOÀI SẢNH CHỜ
function renderRoomCard(roomId, displayIndex, room) {
    const card = document.createElement('div');
    card.className = 'room-card' + (displayIndex <= 3 ? ' is-bot' : '');
    
    const icon = document.createElement('div');
    icon.className = 'room-icon';
    card.appendChild(icon);

    const name = document.createElement('div');
    name.className = 'room-name';
    name.innerText = 'Phòng ' + displayIndex;
    card.appendChild(name);

    const status = document.createElement('div');
    status.className = 'room-status';
    
    if(room.status === 'playing') {
        status.innerText = 'Đang đấu - Vào Xem';
    } else if(room.status === 'waiting') {
        status.innerText = 'Chờ đấu - Vào Chơi';
    } else {
        status.innerText = 'Trống';
    }
    card.appendChild(status);

    if(room.pass) {
        const lock = document.createElement('div');
        lock.className = 'room-lock';
        lock.innerText = '🔒';
        card.appendChild(lock);
    }

    card.onclick = () => {
        if(displayIndex <= 3) {
            // Vào xem trận Bot đấu với Bot
            joinGameRoom(roomId, true);
        } else {
            if(room.pass) {
                const inputPass = prompt("Nhập mật mã để vào phòng này:");
                if(inputPass !== room.pass) {
                    alert("Sai mật mã phòng!");
                    return;
                }
            }
            joinGameRoom(roomId);
        }
    };
    roomListContainer.appendChild(card);
}

// VÀO PHÒNG GAME VÀ ĐỒNG BỘ DỮ LIỆU CHƠI / CHAT REALTIME
function joinGameRoom(roomId, isForcedViewer = false) {
    currentRoomId = roomId;
    screenLobby.classList.remove('active');
    screenGame.classList.add('active');
    document.getElementById('display-room-name').innerText = "Phòng: " + roomId.replace("room_","");
    
    // Cuộn bàn cờ về vị trí trung tâm để người chơi dễ quan sát ngay lập tức
    boardWrapper.scrollLeft = (BOARD_SIZE * 25 / 2) - 150;
    boardWrapper.scrollTop = (BOARD_SIZE * 25 / 2) - 100;

    database.ref('rooms/' + roomId).once('value', snapshot => {
        const room = snapshot.val();
        if(isForcedViewer) {
            myRole = 'viewer';
        } else {
            if(room.p1 === myUsername) { myRole = 'p1'; }
            else if(!room.p2 || room.p2 === '') {
                myRole = 'p2';
                database.ref('rooms/' + roomId + '/p2').set(myUsername);
                database.ref('rooms/' + roomId + '/status').set('playing');
            } else {
                myRole = 'viewer';
            }
        }

        // Nếu là người xem thì ẩn hoàn toàn khung chat
        document.getElementById('chat-container').style.display = (myRole === 'viewer') ? 'none' : 'flex';
        
        // Kích hoạt lắng nghe dữ liệu từ Firebase về phòng này
        listenToRoomUpdates(roomId);
    });
}

function listenToRoomUpdates(roomId) {
    database.ref('rooms/' + roomId).on('value', snapshot => {
        const room = snapshot.val();
        if(!room) return;

        // Cập nhật giao diện thông tin người chơi
        document.getElementById('p1-name').innerText = room.p1 || 'Đang chờ...';
        document.getElementById('p2-name').innerText = room.p2 || 'Đang chờ...';
        
        document.getElementById('player1-box').className = 'player-card' + (room.turn === 'p1' ? ' active-turn' : '');
        document.getElementById('player2-box').className = 'player-card' + (room.turn === 'p2' ? ' active-turn' : '');

        document.getElementById('game-timer').innerText = (room.timer || 60) + 's';

        // Render toàn bộ quân cờ thực tế lên bàn cờ
        // Xóa sạch các quân cũ trước khi nạp dữ liệu mới
        document.querySelectorAll('.board-canvas .piece').forEach(p => p.remove());
        const movesArr = room.moves ? room.moves.split(';') : [];
        movesArr.forEach(mStr => {
            if(!mStr) return;
            const [r, c, role] = mStr.split(',');
            drawPieceOnBoard(parseInt(r), parseInt(c), role, false);
        });

        // Nếu có nước đi nhấp thử hiện tại, hãy vẽ nó lên màn hình
        if(selectedPreviewMove) {
            drawPieceOnBoard(selectedPreviewMove.r, selectedPreviewMove.c, myRole, true);
        }

        // Quản lý trạng thái vô hiệu hóa nút bấm xác nhận
        if(room.turn === myRole && room.status === 'playing') {
            btnConfirmMove.disabled = (selectedPreviewMove === null);
        } else {
            btnConfirmMove.disabled = true;
        }

        // KÍCH HOẠT ĐỒNG HỒ ĐẾM NGƯỢC NỘI BỘ CHO NGƯỜI CHỦ PHÒNG (P1) ĐỂ ĐỒNG BỘ LÊN CLOUD
        if(myRole === 'p1') {
            startLocalCountdown(room);
        }

        // ĐỐI ĐẦU VỚI BOT: Nếu đến lượt Bot và là phòng tự tạo mở, Bot sẽ tính nước đi
        if(room.status === 'playing' && room.turn === 'p2' && room.p2.startsWith('botAI_')) {
            // Chỉ chạy xử lý Bot nếu người tính toán là máy chủ kiểm soát phòng
            if(myRole === 'p1') {
                triggerBotAIMove(roomId, movesArr);
            }
        }
    });

    // Lắng nghe dữ liệu Chat trong phòng
    database.ref('rooms/' + roomId + '/chats').on('value', snap => {
        const chatBox = document.getElementById('chat-messages');
        chatBox.innerHTML = '';
        const chats = snap.val() || [];
        chats.forEach(c => {
            const line = document.createElement('div');
            line.className = 'chat-line';
            line.innerHTML = `<span class="chat-user">${c.sender}:</span> <span class="chat-text">${c.msg}</span>`;
            chatBox.appendChild(line);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

// ĐỒNG HỒ ĐẾM NGƯỢC TRẬN ĐẤU
function startLocalCountdown(room) {
    if(gameCountdownInterval) clearInterval(gameCountdownInterval);
    if(room.status !== 'playing') return;

    let currentSeconds = room.timer || 60;
    gameCountdownInterval = setInterval(() => {
        currentSeconds--;
        if(currentSeconds <= 0) {
            clearInterval(gameCountdownInterval);
            // Xử lý thua cuộc do hết giờ
            const winner = (room.turn === 'p1') ? room.p2 : room.p1;
            database.ref('rooms/' + currentRoomId + '/status').set('ended');
            alert(`Hết giờ! Trận đấu kết thúc.`);
        } else {
            database.ref('rooms/' + currentRoomId + '/timer').set(currentSeconds);
        }
    }, 1000);
}

// IN QUÂN CỜ LÊN MÀN HÌNH CHỈNH CSS
function drawPieceOnBoard(r, c, role, isPreview) {
    const cell = document.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);
    if(cell) {
        const p = document.createElement('div');
        p.className = `piece ${role === 'p1' ? 'white' : 'black'}` + (isPreview ? ' preview' : '');
        cell.appendChild(p);
    }
}

// XỬ LÝ NHẤP THỬ VÀ THU HỒI QUÂN CỜ ĐANG ĐẶT THỬ
function handleCellClick(r, c) {
    if(!currentRoomId || myRole === 'viewer') return;
    
    // Kiểm tra xem có đúng lượt của mình không
    database.ref('rooms/' + currentRoomId).once('value', snap => {
        const room = snap.val();
        if(room.turn !== myRole || room.status !== 'playing') return;

        // Kiểm tra xem ô này đã có quân cờ thực tế nào chưa
        const movesArr = room.moves ? room.moves.split(';') : [];
        const isOccupied = movesArr.some(m => m.startsWith(`${r},${c},`));
        if(isOccupied) return;

        if(selectedPreviewMove && selectedPreviewMove.r === r && selectedPreviewMove.c === c) {
            // THU HỒI: Nhấn lại chính ô đang thử để gỡ ra
            selectedPreviewMove = null;
        } else {
            // THỬ NGHIỆM ĐẶT QUÂN CỜ VÀO Ô MỚI
            selectedPreviewMove = { r: r, c: c };
        }
        
        // Buộc hệ thống cập nhật render lại giao diện tức thì
        database.ref('rooms/' + currentRoomId).set(room);
    });
}

// XÁC NHẬN NƯỚC ĐI - KIỂM TRA LUẬT 5 QUÂN KHÔNG CHẶN 2 ĐẦU
document.getElementById('btn-confirm-move').onclick = function() {
    if(!currentRoomId || !selectedPreviewMove) return;

    database.ref('rooms/' + currentRoomId).once('value', snap => {
        const room = snap.val();
        let movesArr = room.moves ? room.moves.split(';') : [];
        const newMoveStr = `${selectedPreviewMove.r},${selectedPreviewMove.c},${myRole}`;
        movesArr.push(newMoveStr);
        
        const updatedMovesStr = movesArr.filter(Boolean).join(';');
        const isWin = checkWinCondition(selectedPreviewMove.r, selectedPreviewMove.c, myRole, movesArr);
        
        const nextTurn = (myRole === 'p1') ? 'p2' : 'p1';
        selectedPreviewMove = null;

        if(isWin) {
            database.ref('rooms/' + currentRoomId).update({
                moves: updatedMovesStr,
                status: 'ended',
                timer: 60
            });
            showModal("Kết Thúc Trận", (myRole === 'p1' ? room.p1 : room.p2) + " đã giành chiến thắng!");
        } else {
            database.ref('rooms/' + currentRoomId).update({
                moves: updatedMovesStr,
                turn: nextTurn,
                timer: 60
            });
        }
    });
};

// THUẬT TOÁN QUÉT KIỂM TRA ĐIỀU KIỆN THẮNG (KHÔNG CHẶN 2 ĐẦU)
function checkWinCondition(r, c, role, movesArr) {
    const grid = {};
    movesArr.forEach(m => {
        if(!m) return;
        const [row, col, pRole] = m.split(',');
        grid[`${row}_${col}`] = pRole;
    });

    const directions = [
        [0, 1],   // Ngang
        [1, 0],   // Dọc
        [1, 1],   // Chéo xuôi
        [1, -1]   // Chéo ngược
    ];

    for (let [dr, dc] of directions) {
        let count = 1;
        
        // Quét tiến về một hướng
        let rForward = r + dr, cForward = c + dc;
        while (grid[`${rForward}_${cForward}`] === role) { count++; rForward += dr; cForward += dc; }
        // Kiểm tra xem đầu tiến có bị chặn bởi quân đối phương không
        const headBlocked = grid[`${rForward}_${cForward}`] !== undefined && grid[`${rForward}_${cForward}`] !== role;

        // Quét lùi về hướng ngược lại
        let rBackward = r - dr, cBackward = c - dc;
        while (grid[`${rBackward}_${cBackward}`] === role) { count++; rBackward -= dr; cBackward -= dc; }
        // Kiểm tra xem đầu lùi có bị chặn bởi quân đối phương không
        const tailBlocked = grid[`${rBackward}_${cBackward}`] !== undefined && grid[`${rBackward}_${cBackward}`] !== role;

        if (count >= 5) {
            // Đúng luật cờ Caro Việt Nam: Đủ 5 quân nhưng bị chặn cứng CẢ HAI ĐẦU thì không tính là thắng
            if (headBlocked && tailBlocked) {
                continue; 
            }
            return true;
        }
    }
    return false;
}

// KHUNG CHAT VÀ EMOJI CHUYÊN NGHIỆP
document.getElementById('btn-send-chat').onclick = sendChatMessage;
document.getElementById('input-chat-msg').onkeypress = (e) => { if(e.key === 'Enter') sendChatMessage(); };

function sendChatMessage() {
    const input = document.getElementById('input-chat-msg');
    const text = input.value.trim();
    if(!text || !currentRoomId || myRole === 'viewer') return;

    database.ref('rooms/' + currentRoomId + '/chats').once('value', snap => {
        let chats = snap.val() || [];
        chats.push({ sender: myUsername, msg: text });
        if(chats.length > 20) chats.shift(); // Tự động dọn dẹp giữ lại 20 dòng chat
        database.ref('rooms/' + currentRoomId + '/chats').set(chats);
    });
    input.value = '';
}

document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.onclick = function() {
        if(!currentRoomId || myRole === 'viewer') return;
        const emoji = this.innerText;
        database.ref('rooms/' + currentRoomId + '/chats').once('value', snap => {
            let chats = snap.val() || [];
            chats.push({ sender: myUsername, msg: emoji });
            if(chats.length > 20) chats.shift();
            database.ref('rooms/' + currentRoomId + '/chats').set(chats);
        });
    };
});

// NÚT XIN VÁN MỚI (CHỦ ĐỘNG HỎI HOẶC TỰ ĐỒNG Ý NẾU ĐẤU VỚI BOT)
document.getElementById('btn-new-game').onclick = function() {
    if(!currentRoomId) return;
    database.ref('rooms/' + currentRoomId).once('value', snap => {
        const room = snap.val();
        if(room.p2.startsWith('botAI_')) {
            // Nếu chơi với Bot, Bot tự động đồng ý ngay tức khắc
            alert("Đối thủ (Bot) đã đồng ý chơi ván mới!");
            database.ref('rooms/' + currentRoomId).update({
                status: 'playing', turn: 'p1', moves: '', timer: 60, chats: []
            });
        } else {
            // Nếu người thật chơi với nhau
            if(confirm("Bạn có muốn gửi yêu cầu làm ván mới tới đối thủ?")) {
                database.ref('rooms/' + currentRoomId + '/chats').once('value', cSnap => {
                    let chats = cSnap.val() || [];
                    chats.push({ sender: "Hệ thống", msg: `👉 ${myUsername} muốn xin chơi Ván Mới.` });
                    database.ref('rooms/' + currentRoomId + '/chats').set(chats);
                });
            }
        }
    });
};

// NÚT THOÁT PHÒNG KHỎI PHÒNG GAME VỀ SẢNH
document.getElementById('btn-leave-room').onclick = function() {
    if(!currentRoomId) return;
    if(gameCountdownInterval) clearInterval(gameCountdownInterval);
    database.ref('rooms/' + currentRoomId).off();
    
    if(myRole !== 'viewer') {
        database.ref('rooms/' + currentRoomId).once('value', snap => {
            const room = snap.val();
            if(room) {
                // Nếu phòng trống hoàn toàn hoặc là phòng người chơi tự tạo mở rộng, xóa phòng để giải phóng tài nguyên
                if(room.p1 === myUsername && (!room.p2 || room.p2 === '')) {
                    database.ref('rooms/' + currentRoomId).remove();
                } else if(room.p1 === myUsername) {
                    database.ref('rooms/' + currentRoomId + '/p1').set('');
                    database.ref('rooms/' + currentRoomId + '/status').set('ended');
                } else if(room.p2 === myUsername) {
                    database.ref('rooms/' + currentRoomId + '/p2').set('');
                    database.ref('rooms/' + currentRoomId + '/status').set('ended');
                }
            }
        });
    }
    
    currentRoomId = null;
    myRole = null;
    screenGame.classList.remove('active');
    screenLobby.classList.add('active');
};

// ĐIỀU KHIỂN HỘP THOẠI POPUP THÔNG BÁO CHUNG
function showModal(title, text) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-text').innerText = text;
    document.getElementById('modal-overlay').classList.add('active');
}
document.getElementById('btn-modal-close').onclick = () => {
    document.getElementById('modal-overlay').classList.remove('active');
};