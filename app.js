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
    // === CODE KIỂM TRA VÀ TỰ ĐỘNG RESET PHÒNG SANG NGÀY MỚI ===
    database.ref('metadata/last_reset_day').once('value', snapshot => {
        // Lấy ngày hiện tại theo định dạng ngày/tháng/năm của Việt Nam
        const todayStr = new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const lastResetDay = snapshot.val();

        // Nếu ngày hôm nay khác với ngày reset gần nhất lưu trên hệ thống
        if (lastResetDay !== todayStr) {
            database.ref('rooms').once('value', roomSnap => {
                const allRooms = roomSnap.val() || {};
                
                // Duyệt qua tất cả các phòng, tiến hành xóa các phòng rác do người chơi tạo (từ phòng 8 trở đi)
                Object.keys(allRooms).forEach(roomId => {
                    const idx = parseInt(roomId.replace('room_', ''));
                    if (idx > 7) {
                        database.ref('rooms/' + roomId).remove();
                    }
                });

                // Sau khi xóa xong, cập nhật ngày hôm nay thành ngày reset gần nhất
                database.ref('metadata/last_reset_day').set(todayStr);
                console.log("Hệ thống đã được dọn dẹp sạch sẽ cho ngày mới: " + todayStr);
            });
        }
    });

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
            while(data['room_' + nextIndex]) { nextIndex++; }
            
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

    // Đọc nội dung hướng dẫn từ file huongdan.js
    document.getElementById('btn-guide').onclick = function() {
        if (typeof GAME_GUIDE_CONTENT !== 'undefined') {
            showModal(GAME_GUIDE_CONTENT.title, GAME_GUIDE_CONTENT.text);
        } else {
            showModal("Hướng Dẫn", "Luật chơi caro 5 quân chặn hai đầu. Click chọn ô cờ và nhấn Xác nhận.");
        }
    };
}

// IN CARD PHÒNG RA SẢNH CHỜ
function renderRoomCard(roomId, displayIndex, room) {
    const card = document.createElement('div');
    card.className = 'room-card' + (displayIndex <= 7 ? ' is-bot' : '');
    
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
        if(displayIndex <= 7) {
            joinGameRoom(roomId, true);
        } else {
            if(room.status === 'empty') {
                alert("Phòng không còn tồn tại!");
                return;
            }
            if(room.pass) {
                const inputPass = prompt("Nhập mật mã phòng này:");
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

// THỦ TỤC VÀO PHÒNG VÀ ĐỒNG BỘ DÂN CƯ TRONG PHÒNG GAME
function joinGameRoom(roomId, isForcedViewer = false) {
    currentRoomId = roomId;
    screenLobby.classList.remove('active');
    screenGame.classList.add('active');
    document.getElementById('display-room-name').innerText = "Phòng: " + roomId.replace("room_","");
    
    boardWrapper.scrollLeft = (BOARD_SIZE * 25 / 2) - 150;
    boardWrapper.scrollTop = (BOARD_SIZE * 25 / 2) - 100;

    database.ref('rooms/' + roomId).once('value', snapshot => {
        const room = snapshot.val();
        if(!room && !isForcedViewer) {
            alert("Phòng không tồn tại!");
            document.getElementById('btn-leave-room').click();
            return;
        }

        if(isForcedViewer) {
            myRole = 'viewer';
            const idx = roomId.replace('room_', '');
            if(parseInt(idx) <= 7) {
                runBotVersusLoop(roomId);
            }
        } else {
            if(room.p1 === myUsername) { 
                myRole = 'p1'; 
                if(!room.pass || room.pass === "") {
                    if(botMatchmakerTimeout) clearTimeout(botMatchmakerTimeout);
                    botMatchmakerTimeout = setTimeout(() => {
                        checkAndTriggerFakePlayerBot(roomId);
                    }, 5000); 
                }
            } else if(!room.p2 || room.p2 === '') {
                myRole = 'p2';
                database.ref('rooms/' + roomId + '/p2').set(myUsername);
                database.ref('rooms/' + roomId + '/status').set('playing');
            } else {
                myRole = 'viewer';
            }
        }

        if(myRole === 'viewer') {
            document.getElementById('chat-container').style.display = 'none';
            document.getElementById('btn-confirm-move').style.display = 'none';
            document.getElementById('btn-new-game').disabled = true;
        } else {
            document.getElementById('chat-container').style.display = 'flex';
            document.getElementById('btn-confirm-move').style.display = 'block';
            document.getElementById('btn-new-game').disabled = false;
        }
        
        listenToRoomUpdates(roomId);
    });
}

function listenToRoomUpdates(roomId) {
    database.ref('rooms/' + roomId).on('value', snapshot => {
        const room = snapshot.val();
        
        if(!room) {
            const idx = parseInt(roomId.replace('room_', ''));
            if(idx > 7 && currentRoomId === roomId) {
                if(gameCountdownInterval) clearInterval(gameCountdownInterval);
                if(botMatchmakerTimeout) clearTimeout(botMatchmakerTimeout);
                database.ref('rooms/' + roomId).off();
                currentRoomId = null;
                myRole = null;
                screenGame.classList.remove('active');
                screenLobby.classList.add('active');
                alert("Đối thủ đã thoát ván hoặc phòng đấu đã bị hủy!");
            }
            return;
        }

        // BỘ LỌC HIỂN THỊ TRONG PHÒNG ĐẤU: Cắt bỏ triệt để chữ botAI_ nếu lỡ xuất hiện từ DB cũ
        let p1NameFiltered = room.p1 || 'Đang chờ...';
        let p2NameFiltered = room.p2 || 'Đang chờ...';
        
        if(p1NameFiltered.includes("botAI_")) p1NameFiltered = p1NameFiltered.replace(/botAI_/g, "");
        if(p2NameFiltered.includes("botAI_")) p2NameFiltered = p2NameFiltered.replace(/botAI_/g, "");

        document.getElementById('p1-name').innerText = p1NameFiltered;
        document.getElementById('p2-name').innerText = p2NameFiltered;
        
        document.getElementById('player1-box').style.border = room.turn === 'p1' ? '1px solid #00e5ff' : 'none';
        document.getElementById('player2-box').style.border = room.turn === 'p2' ? '1px solid #00e5ff' : 'none';

        document.getElementById('game-timer').innerText = (room.timer || 60) + 's';

        // Vẽ lại bàn cờ
        document.querySelectorAll('.board-canvas .piece').forEach(p => p.remove());
        const movesArr = room.moves ? room.moves.split(';') : [];
        movesArr.forEach(mStr => {
            if(!mStr) return;
            const [r, c, role] = mStr.split(',');
            drawPieceOnBoard(parseInt(r), parseInt(c), role, false);
        });

        if(selectedPreviewMove) {
            drawPieceOnBoard(selectedPreviewMove.r, selectedPreviewMove.c, myRole, true);
        }

        if(myRole !== 'viewer' && room.turn === myRole && room.status === 'playing') {
            btnConfirmMove.disabled = (selectedPreviewMove === null);
        } else {
            btnConfirmMove.disabled = true;
        }

        if(myRole === 'p1') {
            startLocalCountdown(room);
        }

        // KÍCH HOẠT BOT ĐI QUÂN (Đối chiếu theo bộ lọc tên sạch)
        if(room.status === 'playing' && room.turn === 'p2' && room.p2 && isBotAccount(p2NameFiltered)) {
            if(myRole === 'p1') {
                triggerBotAIMove(roomId, movesArr);
            }
        }
    });

    // Lắng nghe dữ liệu Chat
    database.ref('rooms/' + roomId + '/chats').on('value', snap => {
        if(myRole === 'viewer') return;
        const chatBox = document.getElementById('chat-messages');
        if(!chatBox) return;
        chatBox.innerHTML = '';
        const chats = snap.val() || [];
        chats.forEach(c => {
            let senderName = c.sender || "";
            if(senderName.includes("botAI_")) senderName = senderName.replace(/botAI_/g, "");
            
            const line = document.createElement('div');
            line.className = 'chat-line';
            line.innerHTML = `<span class="chat-user">${senderName}:</span> <span class="chat-text">${c.msg}</span>`;
            chatBox.appendChild(line);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

// ĐỐI CHIẾU DANH TÍNH BOT QUA KHO TÊN SẠCH THUẦN VIỆT
function isBotAccount(name) {
    if(!name) return false;
    let cleanName = name.replace(/botAI_/g, "");
    if(typeof ALL_PURE_VIET_NAMES !== 'undefined') {
        return ALL_PURE_VIET_NAMES.includes(cleanName);
    }
    return false;
}

// QUÉT DỌN PHÒNG TREO QÚA THỜI GIAN
function cleanUpAbandonedRooms() {
    database.ref('rooms').once('value', snap => {
        const allRooms = snap.val() || {};
        const now = Date.now();
        
        Object.keys(allRooms).forEach(roomId => {
            const idx = parseInt(roomId.replace('room_', ''));
            if(idx <= 7) return; 

            const room = allRooms[roomId];
            if(!room.p1 && !room.p2) {
                database.ref('rooms/' + roomId).remove();
                return;
            }
            if(room.status === 'waiting' && room.createdAt && (now - room.createdAt > 120000)) {
                database.ref('rooms/' + roomId).remove(); 
            }
        });
    });
}

// ĐẾM NGƯỢC THỜI GIAN TRẬN ĐẤU
function startLocalCountdown(room) {
    if(gameCountdownInterval) clearInterval(gameCountdownInterval);
    if(room.status !== 'playing') return;

    let currentSeconds = room.timer || 60;
    gameCountdownInterval = setInterval(() => {
        currentSeconds--;
        if(currentSeconds <= 0) {
            clearInterval(gameCountdownInterval);
            database.ref('rooms/' + currentRoomId + '/status').set('ended');
            alert(`Hết giờ! Trận đấu kết thúc.`);
        } else {
            database.ref('rooms/' + currentRoomId + '/timer').set(currentSeconds);
        }
    }, 1000);
}

// VẼ QUÂN CỜ LÊN BÀN CỜ
function drawPieceOnBoard(r, c, role, isPreview) {
    const cell = document.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);
    if(cell) {
        const p = document.createElement('div');
        p.className = `piece ${role === 'p1' ? 'white' : 'black'}` + (isPreview ? ' preview' : '');
        cell.appendChild(p);
    }
}

// CHỌN Ô CỜ ĐỂ XEM TRƯỚC NƯỚC ĐI
function handleCellClick(r, c) {
    if(!currentRoomId || myRole === 'viewer') return;
    
    database.ref('rooms/' + currentRoomId).once('value', snap => {
        const room = snap.val();
        if(!room || room.turn !== myRole || room.status !== 'playing') return;

        const movesArr = room.moves ? room.moves.split(';') : [];
        const isOccupied = movesArr.some(m => m.startsWith(`${r},${c},`));
        if(isOccupied) return;

        if(selectedPreviewMove && selectedPreviewMove.r === r && selectedPreviewMove.c === c) {
            selectedPreviewMove = null;
        } else {
            selectedPreviewMove = { r: r, c: c };
        }
        
        database.ref('rooms/' + currentRoomId).set(room);
    });
}

// BẤM NÚT XÁC NHẬN HẠ QUÂN CỜ XUỐNG BÀN ĐẤU CHÍNH THỨC
btnConfirmMove.onclick = function() {
    if(!currentRoomId || !selectedPreviewMove) return;

    database.ref('rooms/' + currentRoomId).once('value', snap => {
        const room = snap.val();
        if(!room) return;
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
            let winnerName = (myRole === 'p1' ? room.p1 : room.p2);
            if(winnerName.includes("botAI_")) winnerName = winnerName.replace(/botAI_/g, "");
            showModal("Kết Thúc Trận", winnerName + " đã giành chiến thắng!");
        } else {
            database.ref('rooms/' + currentRoomId).update({
                moves: updatedMovesStr,
                turn: nextTurn,
                timer: 60
            });
        }
    });
};

// KIỂM TRA ĐIỀU KIỆN THẮNG 5 QUÂN KHÔNG BỊ CHẶN 2 ĐẦU
function checkWinCondition(r, c, role, movesArr) {
    const grid = {};
    movesArr.forEach(m => {
        if(!m) return;
        const [row, col, pRole] = m.split(',');
        grid[`${row}_${col}`] = pRole;
    });

    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

    for (let [dr, dc] of directions) {
        let count = 1;
        
        let rForward = r + dr, cForward = c + dc;
        while (grid[`${rForward}_${cForward}`] === role) { count++; rForward += dr; cForward += dc; }
        const headBlocked = grid[`${rForward}_${cForward}`] !== undefined && grid[`${rForward}_${cForward}`] !== role;

        let rBackward = r - dr, cBackward = c - dc;
        while (grid[`${rBackward}_${cBackward}`] === role) { count++; rBackward -= dr; cBackward -= dc; }
        const tailBlocked = grid[`${rBackward}_${cBackward}`] !== undefined && grid[`${rBackward}_${cBackward}`] !== role;

        if (count >= 5) {
            if (headBlocked && tailBlocked) { continue; }
            return true;
        }
    }
    return false;
}

// GỬI CHAT TIN NHẮN
document.getElementById('btn-send-chat').onclick = sendChatMessage;
document.getElementById('input-chat-msg').onkeypress = (e) => { if(e.key === 'Enter') sendChatMessage(); };

function sendChatMessage() {
    const input = document.getElementById('input-chat-msg');
    const text = input.value.trim();
    if(!text || !currentRoomId || myRole === 'viewer') return;

    database.ref('rooms/' + currentRoomId + '/chats').once('value', snap => {
        let chats = snap.val() || [];
        chats.push({ sender: myUsername, msg: text });
        if(chats.length > 20) chats.shift();
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

// SỰ KIỆN NÚT ĐÒI LÀM VÁN MỚI
document.getElementById('btn-new-game').onclick = function() {
    if(!currentRoomId || myRole === 'viewer') return;
    database.ref('rooms/' + currentRoomId).once('value', snap => {
        const room = snap.val();
        if(!room) return;
        if(room.p2 && isBotAccount(room.p2)) {
            alert("Đối thủ đã đồng ý chơi ván mới!");
            database.ref('rooms/' + currentRoomId).update({
                status: 'playing', turn: 'p1', moves: '', timer: 60, chats: []
            });
        } else {
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

// NÚT THOÁT KHỎI PHÒNG QUAY VỀ SẢNH CHỜ KHÔNG ĐỂ LẠI RÁC VÀ PHÒNG RỖNG
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
};

// ĐIỀU KHIỂN ĐÓNG MỞ MODAL POPUP THÔNG BÁO TỰ DO
function showModal(title, text) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-text').innerText = text;
    document.getElementById('modal-overlay').classList.add('active');
}
document.getElementById('btn-modal-close').onclick = () => {
    document.getElementById('modal-overlay').classList.remove('active');
};