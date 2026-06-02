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
let myRole = null; // 'p1', 'p2', hoặc 'viewer'
let selectedPreviewMove = null; 
let gameCountdownInterval = null;
let botMatchmakerTimeout = null; 
const BOARD_SIZE = 80; 

// Các phần tử DOM tương tác
const screenLobby = document.getElementById('screen-lobby');
const screenGame = document.getElementById('screen-game');
const roomListContainer = document.getElementById('room-list');
const boardCanvas = document.getElementById('board-canvas');
const boardWrapper = document.getElementById('board-wrapper');
const btnConfirmMove = document.getElementById('btn-confirm-move');
const displayMyUsername = document.getElementById('display-my-username');
const btnChangeUsername = document.getElementById('btn-change-username');

// CHẶN CHUỘT PHẢI BẢO MẬT BAN BÀN CỜ
document.addEventListener('contextmenu', e => e.preventDefault());

// KHỞI ĐỘNG HỆ THỐNG GIAO DIỆN
window.onload = function() {
    displayMyUsername.innerText = myUsername;

    initLobbySystem();
    setupCanvasGrid();
    setupDragToScroll();
    
    // SỰ KIỆN NÚT ĐỔI TÊN CHUYÊN NGHIỆP TÙY CHỈNH
    btnChangeUsername.onclick = function() {
        const newName = prompt("Nhập tên mới của bạn (Có thể nhập chữ có dấu hoặc ký hiệu tùy thích):", myUsername);
        if(newName && newName.trim() !== "") {
            myUsername = newName.trim();
            displayMyUsername.innerText = myUsername;
            
            if(currentRoomId && myRole && myRole !== 'viewer') {
                database.ref('rooms/' + currentRoomId + '/' + myRole).set(myUsername);
            }
        }
    };

    // QUÉT PHÒNG TRỐNG TREO MỖI 10 GIÂY
    setInterval(cleanUpAbandonedRooms, 10000);
};

// DỰNG LƯỚI BÀN CỜ CARO RỘNG 80x80
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

// KÉO DI CHUYỂN CUỘN TRÊN ĐIỆN THOẠI VÀ MÁY TÍNH VÔ HẠN MƯỢT MÀ
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

// KHỞI TẠO HỆ THỐNG SẢNH CHỜ VÀ ĐỒNG BỘ PHÒNG
function initLobbySystem() {
    // Ép làm sạch 7 phòng bot ngay khi ứng dụng khởi chạy để đẩy hết rác cũ đi
    for (let i = 1; i <= 7; i++) {
        resetBotVersusRoom(i);
    }

    // Đọc danh sách phòng theo thời gian thực từ Firebase
    database.ref('rooms').on('value', snapshot => {
        roomListContainer.innerHTML = '';
        const allRooms = snapshot.val() || {};
        
        let index = 1;
        while(true) {
            let roomId = 'room_' + index;
            if (index > 7 && !allRooms[roomId]) {
                break; 
            }
            const room = allRooms[roomId] || { status: 'empty' };

            // BỘ LỌC BẢO VỆ: Nếu phát hiện dữ liệu phòng cũ dính chữ botAI_, cắt bỏ ngay tại chỗ
            if(room.p1 && room.p1.includes("botAI_")) {
                room.p1 = room.p1.replace(/botAI_/g, "");
            }
            if(room.p2 && room.p2.includes("botAI_")) {
                room.p2 = room.p2.replace(/botAI_/g, "");
            }

            renderRoomCard(roomId, index, room);
            index++;
        }
    });

    // Tạo phòng thủ công mới bằng mật mã phòng công khai/bảo mật
    document.getElementById('btn-create-room').onclick = function() {
        const pass = document.getElementById('input-room-pass').value.trim();
        
        database.ref('rooms').once('value', snap => {
            const data = snap.val() || {};
            let nextIndex = 8;
            while(data['room_' + nextIndex]) {
                nextIndex++;
            }
            const newRoomId = 'room_' + nextIndex;

            database.ref('rooms/' + newRoomId).set({
                status: 'waiting',
                pass: pass,
                p1: myUsername,
                p2: '',
                turn: 'p1',
                moves: '',
                timer: 60,
                createdAt: Date.now()
            }).then(() => {
                joinGameRoom(newRoomId);
            });
        });
    };

    // FIX TRIỆT ĐỂ: Ép nạp chuẩn 100% nội dung hướng dẫn tùy chỉnh từ file huongdan.js
    document.getElementById('btn-guide').onclick = function() {
        showModal(GAME_GUIDE_CONTENT.title, GAME_GUIDE_CONTENT.text);
    };
}

// IN CARD PHÒNG RA SẢNH CHỜ
function renderRoomCard(roomId, displayIndex, room) {
    const card = document.createElement('div');
    card.className = 'room-card ' + room.status;

    const idDiv = document.createElement('div');
    idDiv.className = 'room-id';
    idDiv.innerText = 'PHÒNG ' + displayIndex;
    card.appendChild(idDiv);

    const vsDiv = document.createElement('div');
    vsDiv.className = 'room-vs';
    if(room.status === 'empty') {
        vsDiv.innerText = 'Trống';
    } else {
        const player1 = room.p1 || 'Ẩn danh';
        const player2 = room.p2 || 'Đang chờ...';
        vsDiv.innerText = player1 + ' vs ' + player2;
    }
    card.appendChild(vsDiv);

    const statusDiv = document.createElement('div');
    statusDiv.className = 'room-status';
    if(room.status === 'playing') statusDiv.innerText = 'ĐANG ĐẤU';
    if(room.status === 'waiting') statusDiv.innerText = 'CHỜ NGƯỜI';
    if(room.status === 'empty') statusDiv.innerText = 'SẴN SÀNG';
    card.appendChild(statusDiv);

    if(room.status !== 'empty') {
        card.onclick = function() {
            if(room.status === 'playing') {
                joinGameRoom(roomId);
                return;
            }
            if(room.pass && room.pass !== '') {
                const userPass = prompt('Phòng này yêu cầu mật mã bảo mật để vào:');
                if(userPass !== room.pass) {
                    alert('Mật mã phòng không chính xác!');
                    return;
                }
            }
            joinGameRoom(roomId);
        };
    }

    roomListContainer.appendChild(card);
}

// THỦ TỤC VÀO PHÒNG CHƠI VÀ PHÂN VAI TRÒ (P1, P2 HOẶC VIEWER)
function joinGameRoom(roomId) {
    currentRoomId = roomId;
    
    database.ref('rooms/' + roomId).once('value', snap => {
        const room = snap.val();
        if(!room) return;

        // Xác định vai trò
        if(room.p1 === myUsername) {
            myRole = 'p1';
        } else if(room.p2 === myUsername) {
            myRole = 'p2';
        } else if(!room.p2 || room.p2 === '') {
            myRole = 'p2';
            database.ref('rooms/' + roomId + '/p2').set(myUsername);
            database.ref('rooms/' + roomId + '/status').set('playing');
        } else {
            myRole = 'viewer';
            alert('Phòng đã đầy! Bạn đang vào xem trực tiếp ván đấu.');
        }

        // Chuyển màn hình
        screenLobby.classList.remove('active');
        screenGame.classList.add('active');
        document.getElementById('display-room-name').innerText = 'Phòng: ' + roomId.replace('room_', '');

        // Lắng nghe dữ liệu trận đấu thời gian thực từ Firebase
        listenToCurrentRoom();
    });
}

// VÒNG LẶP LẮNG NGHE BIẾN ĐỘNG TRONG PHÒNG ĐANG CHƠI
function listenToCurrentRoom() {
    database.ref('rooms/' + currentRoomId).on('value', snap => {
        const room = snap.val();
        if(!room) {
            handleRoomDisbanded();
            return;
        }

        // Cập nhật tên hiển thị của 2 đấu thủ công khai
        document.getElementById('p1-name').innerText = room.p1 || 'Đang chờ...';
        document.getElementById('p2-name').innerText = room.p2 || 'Đang chờ...';

        // Làm nổi bật khung viền người đến lượt đi
        document.getElementById('player1-box').style.boxShadow = room.turn === 'p1' ? '0 0 10px #00e5ff' : 'none';
        document.getElementById('player2-box').style.boxShadow = room.turn === 'p2' ? '0 0 10px #00e5ff' : 'none';

        // Đếm ngược thời gian
        document.getElementById('game-timer').innerText = (room.timer || 60) + 's';

        // Vẽ lại toàn bộ quân cờ lên bàn cờ canvas dựa trên chuỗi moves lưu trữ trên server
        renderPiecesFromMovesString(room.moves);

        // Quản lý trạng thái bật/tắt của nút "Xác Nhận Nước Đi"
        if(room.status === 'playing' && room.turn === myRole) {
            if(selectedPreviewMove) {
                btnConfirmMove.disabled = false;
            } else {
                btnConfirmMove.disabled = true;
            }
        } else {
            btnConfirmMove.disabled = true;
        }

        // Xử lý tự động phân tích nếu đến lượt đi của tài khoản Bot giả lập người thật
        if(room.status === 'playing' && room.turn === 'p2' && isBotAccount(room.p2)) {
            if(!botMatchmakerTimeout) {
                botMatchmakerTimeout = setTimeout(() => {
                    executeBotAiLogicTurn(currentRoomId, room.moves);
                    botMatchmakerTimeout = null;
                }, Math.floor(2500 + Math.random() * 3000));
            }
        }

        // Đồng bộ khung chat tin nhắn
        if(room.chats) {
            const chatBox = document.getElementById('chat-messages');
            chatBox.innerHTML = '';
            room.chats.forEach(c => {
                const row = document.createElement('div');
                row.className = 'chat-row';
                row.innerHTML = `<span class="chat-user">${c.sender}:</span> <span class="chat-text">${c.msg}</span>`;
                chatBox.appendChild(row);
            });
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    });
}

// VẼ LẠI QUÂN CỜ
function renderPiecesFromMovesString(movesStr) {
    // Xóa hết toàn bộ quân cờ cũ trên canvas grid cũ đi
    const oldPieces = boardCanvas.querySelectorAll('.piece');
    oldPieces.forEach(p => p.remove());

    if(!movesStr || movesStr.trim() === '') return;

    const movesArr = movesStr.split(';');
    movesArr.forEach((move, idx) => {
        if(!move || move.trim() === "") return;
        const [r, c, role] = move.split(',');
        
        const piece = document.createElement('div');
        piece.className = 'piece ' + (role === 'p1' ? 'p1-piece' : 'p2-piece');
        piece.innerText = role === 'p1' ? 'O' : 'X';
        piece.style.top = (parseInt(r) * 25) + 'px';
        piece.style.left = (parseInt(c) * 25) + 'px';
        
        boardCanvas.appendChild(piece);
    });

    selectedPreviewMove = null;
}

// XỬ LÝ SỰ KIỆN CLICK CHỌN Ô TRÊN BÀN CỜ
function handleCellClick(r, c) {
    database.ref('rooms/' + currentRoomId).once('value', snap => {
        const room = snap.val();
        if(!room || room.status !== 'playing' || room.turn !== myRole) return;

        // Kiểm tra xem ô này đã có quân cờ cố định hạ xuống trước đó chưa
        const movesStr = room.moves || '';
        if(movesStr.includes(`${r},${c},`)) return;

        // Xóa quân cờ xem trước (preview) cũ nếu có
        const oldPreview = boardCanvas.querySelector('.preview-piece');
        if(oldPreview) oldPreview.remove();

        // Tạo quân cờ bóng mờ xem trước tại vị trí mới nhấp
        selectedPreviewMove = { r: r, c: c, role: myRole };
        
        const previewPiece = document.createElement('div');
        previewPiece.className = 'piece preview-piece ' + (myRole === 'p1' ? 'p1-piece' : 'p2-piece');
        previewPiece.innerText = myRole === 'p1' ? 'O' : 'X';
        previewPiece.style.top = (r * 25) + 'px';
        previewPiece.style.left = (c * 25) + 'px';
        
        boardCanvas.appendChild(previewPiece);
        btnConfirmMove.disabled = false;
    });
}

// SỰ KIỆN NÚT BẤM XÁC NHẬN NƯỚC ĐI CHÍNH THỨC HẠ QUÂN
btnConfirmMove.onclick = function() {
    if(!currentRoomId || !selectedPreviewMove) return;

    database.ref('rooms/' + currentRoomId).once('value', snap => {
        const room = snap.val();
        if(!room || room.status !== 'playing' || room.turn !== myRole) return;

        let currentMoves = room.moves || '';
        const newMoveStr = `${selectedPreviewMove.r},${selectedPreviewMove.c},${selectedPreviewMove.role}`;
        currentMoves = currentMoves === '' ? newMoveStr : currentMoves + ';' + newMoveStr;

        // Kiểm tra thắng cuộc bằng thuật toán quét chặn hai đầu
        const grid = {};
        currentMoves.split(';').forEach(m => {
            const [rr, cc, role] = m.split(',');
            grid[`${rr}_${cc}`] = role;
        });

        const isWin = checkCaroWinWithBlockedEnds(selectedPreviewMove.r, selectedPreviewMove.c, selectedPreviewMove.role, grid);
        
        const nextTurn = myRole === 'p1' ? 'p2' : 'p1';
        const updates = {};
        updates['/moves'] = currentMoves;
        updates['/timer'] = 60; // Reset đồng hồ lượt mới về 60 giây

        if(isWin) {
            updates['/status'] = 'ended';
            database.ref('rooms/' + currentRoomId).update(updates).then(() => {
                showModal('Kết Thúc Trận Đấu', `Chúc mừng! Bạn [${myUsername}] đã xuất sắc chiến thắng ván cờ này!`);
            });
        } else {
            updates['/turn'] = nextTurn;
            database.ref('rooms/' + currentRoomId).update(updates);
        }

        selectedPreviewMove = null;
    });
};

// THUẬT TOÁN QUÉT 5 QUÂN CARO LIÊN TIẾP CHẶN HAI ĐẦU CHUẨN XÁC KHÔNG LỖI
function checkCaroWinWithBlockedEnds(r, c, role, grid) {
    const directions = [[0,1], [1,0], [1,1], [1,-1]]; // Ngang, Dọc, Chéo xuôi, Chéo ngược
    const enemyRole = role === 'p1' ? 'p2' : 'p1';

    for(let [dr, dc] of directions) {
        let count = 1;
        
        // Quét tiến về phía trước
        let rForward = r + dr; let cForward = c + dc;
        while(grid[`${rForward}_${cForward}`] === role) {
            count++; rForward += dr; cForward += dc;
        }
        const blockForward = grid[`${rForward}_${cForward}`] === enemyRole;

        // Quét lùi về phía sau
        let rBackward = r - dr; let cBackward = c - dc;
        while(grid[`${rBackward}_${cBackward}`] === role) {
            count++; rBackward -= dr; cBackward -= dc;
        }
        const blockBackward = grid[`${rBackward}_${cBackward}`] === enemyRole;

        // Nếu xếp đủ từ 5 quân liên tiếp trở lên theo hàng
        if(count >= 5) {
            // Nếu bị chặn đứng ở cả 2 đầu bởi quân địch, không tính thắng cuộc
            if(blockForward && blockBackward) {
                continue; 
            }
            return true;
        }
    }
    return false;
}

// BỘ LỌC ĐỐI CHIẾU KIỂM TRA ĐÂY CÓ PHẢI TÊN TÀI KHOẢN BOT KHÔNG
function isBotAccount(name) {
    if(!name) return false;
    if(typeof ALL_PURE_VIET_NAMES !== 'undefined') {
        return ALL_PURE_VIET_NAMES.includes(name);
    }
    return false;
}

// DỌN PHÒNG TREO BỊ THOÁT NGANG KHI CHƠI
function cleanUpAbandonedRooms() {
    database.ref('rooms').once('value', snap => {
        const rooms = snap.val();
        if(!rooms) return;
        Object.keys(rooms).forEach(id => {
            const idx = parseInt(id.replace('room_',''));
            if(idx > 7) {
                const room = rooms[id];
                // Phòng tùy chỉnh tạo ra quá 1 tiếng mà không ai chơi thì dọn dẹp sạch
                if(room.createdAt && Date.now() - room.createdAt > 3600000) {
                    database.ref('rooms/' + id).remove();
                }
            }
        });
    });
}

// NÚT KHỞI ĐỘNG VÁN MỚI
document.getElementById('btn-new-game').onclick = function() {
    if(!currentRoomId) return;
    database.ref('rooms/' + currentRoomId).update({
        status: 'playing',
        moves: '',
        turn: 'p1',
        timer: 60
    });
};

// GỬI CHAT TIN NHẮN
document.getElementById('btn-send-chat').onclick = executeSendChatMessageAction;
document.getElementById('input-chat-msg').onkeydown = function(e) {
    if(e.key === 'Enter') executeSendChatMessageAction();
};

function executeSendChatMessageAction() {
    const input = document.getElementById('input-chat-msg');
    const msg = input.value.trim();
    if(!currentRoomId || msg === '') return;

    database.ref('rooms/' + currentRoomId + '/chats').once('value', snap => {
        let chats = snap.val() || [];
        chats.push({ sender: myUsername, msg: msg });
        database.ref('rooms/' + currentRoomId + '/chats').set(chats);
        input.value = '';
    });
}

// THẢ CẢM XÚC EMOJI TRỰC TIẾP NHANH CHÓNG
const emojiBtns = document.querySelectorAll('.emoji-btn');
emojiBtns.forEach(btn => {
    btn.onclick = function() {
        if(!currentRoomId) return;
        const emoji = btn.innerText;
        database.ref('rooms/' + currentRoomId + '/chats').once('value', snap => {
            let chats = snap.val() || [];
            chats.push({ sender: myUsername, msg: emoji });
            database.ref('rooms/' + currentRoomId + '/chats').set(chats);
        });
    };
});

// XỬ LÝ KHI PHÒNG CHƠI BỊ GIẢI TÁN HOẶC ĐỐI THỦ THOÁT
function handleRoomDisbanded() {
    if(gameCountdownInterval) clearInterval(gameCountdownInterval);
    currentRoomId = null;
    myRole = null;
    screenGame.classList.remove('active');
    screenLobby.classList.add('active');
}

// NÚT THOÁT KHỎI PHÒNG QUAY VỀ SẢNH CHỜ
document.getElementById('btn-leave-room').onclick = function() {
    if(!currentRoomId) return;
    if(gameCountdownInterval) clearInterval(gameCountdownInterval);
    if(botMatchmakerTimeout) clearTimeout(botMatchmakerTimeout); 
    
    database.ref('rooms/' + currentRoomId).off();
    
    if(myRole !== 'viewer') {
        database.ref('rooms/' + currentRoomId).once('value', snap => {
            const room = snap.val();
            if(room) {
                database.ref('rooms/' + currentRoomId).remove();
            }
        });
    }
    
    currentRoomId = null;
    myRole = null;
    screenGame.classList.remove('active');
    screenLobby.classList.add('active');
}

// ĐIỀU KHIỂN ĐÓNG MỞ MODAL POPUP THÔNG BÁO TỰ DO
function showModal(title, text) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-text').innerText = text;
    document.getElementById('modal-overlay').classList.add('active');
}

document.getElementById('btn-modal-close').onclick = function() {
    document.getElementById('modal-overlay').classList.remove('active');
};