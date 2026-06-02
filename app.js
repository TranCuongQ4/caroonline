// === CẤU HÌNH THÔNG SỐ FIREBASE ===
const firebaseConfig = {
    apiKey: "AIzaSyYOUR_API_KEY_HERE", 
    authDomain: "cuongdata.firebaseapp.com",
    databaseURL: "https://cuongdata-default-rtdb.asia-southeast1.firebasedatabase.app", 
    projectId: "cuongdata",
    storageBucket: "cuongdata.appspot.com",
    messagingSenderId: "1234567890", 
    appId: "1:1234:web:1234" 
};

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Biến quản lý trạng thái tại máy khách
let currentRoomId = null;
let myPlayerId = "spectator"; // Mặc định khi bấm "Vào Xem" là spectator
let botIntervals = {};

// Khởi tạo 3 phòng mặc định trên Firebase nếu chưa tồn tại dữ liệu
function initDefaultRooms() {
    database.ref('rooms').once('value', (snapshot) => {
        if (!snapshot.exists()) {
            const defaultRooms = {};
            for (let i = 1; i <= 3; i++) {
                defaultRooms[`room_${i}`] = {
                    status: "playing",
                    p1: `bot_${Math.floor(100000 + Math.random() * 900000)}`,
                    p2: `bot_${Math.floor(100000 + Math.random() * 900000)}`,
                    turn: "p1",
                    moves: "" // Chuỗi lưu danh sách nước đi, ví dụ: "112,113|125,126"
                };
            }
            database.ref('rooms').set(defaultRooms);
        }
    });
}
initDefaultRooms();

// Lắng nghe danh sách phòng để hiển thị ra Sảnh (Lobby)
database.ref('rooms').on('value', (snapshot) => {
    const roomsData = snapshot.val();
    const roomListContainer = document.getElementById('roomListContainer');
    if (!roomListContainer) return;
    
    roomListContainer.innerHTML = "";
    
    if (roomsData) {
        Object.keys(roomsData).forEach((roomId) => {
            const room = roomsData[roomId];
            const roomDisplayId = roomId.replace('room_', '');
            
            const roomCard = document.createElement('div');
            roomCard.className = 'room-card';
            roomCard.innerHTML = `
                <div class="room-icon">🏠</div>
                <div class="room-title">Phòng ${roomDisplayId}</div>
                <div class="room-status">Đang đấu - Vào Xem</div>
            `;
            
            roomCard.onclick = () => joinRoom(roomId);
            roomListContainer.appendChild(roomCard);
        });
    }
});

// Hàm tham gia vào phòng (Xem Bot đánh)
function joinRoom(roomId) {
    currentRoomId = roomId;
    myPlayerId = "spectator"; // Thiết lập quyền là người xem
    
    document.getElementById('lobbyScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'block';
    document.getElementById('roomTitleText').innerText = `Phòng: ${roomId.replace('room_', '')}`;
    
    // Khóa tất cả các nút điều hướng, chỉ chừa lại nút Thoát
    document.getElementById('btnXacNhan').disabled = true;
    document.getElementById('btnXacNhan').classList.add('disabled-btn');
    document.getElementById('btnVanMoi').disabled = true;
    document.getElementById('btnVanMoi').classList.add('disabled-btn');
    
    // Lắng nghe dữ liệu trận đấu trong phòng
    database.ref(`rooms/${roomId}`).on('value', (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData) return;
        
        document.getElementById('p1Name').innerText = roomData.p1 || "Trống";
        document.getElementById('p2Name').innerText = roomData.p2 || "Trống";
        
        // Vẽ lại bàn cờ dựa trên chuỗi moves từ Firebase
        renderBoardFromMoves(roomData.moves);
        
        // Kích hoạt chu kỳ chạy AI Bot nếu trận đấu đang diễn ra
        handleBotLogic(roomId, roomData);
    });
}

// Thoát khỏi phòng quay về sảnh
function leaveRoom() {
    if (currentRoomId) {
        database.ref(`rooms/${currentRoomId}`).off();
        if (botIntervals[currentRoomId]) {
            clearTimeout(botIntervals[currentRoomId]);
            delete botIntervals[currentRoomId];
        }
        currentRoomId = null;
    }
    document.getElementById('gameScreen').style.display = 'none';
    document.getElementById('lobbyScreen').style.display = 'block';
}

// Vẽ bàn cờ 15x15 caro mô phỏng bàn cờ trong ảnh image_a82eca.png
function renderBoardFromMoves(movesString) {
    const boardElement = document.getElementById('chessBoard');
    if (!boardElement) return;
    
    boardElement.innerHTML = "";
    
    // Tạo ma trận bàn cờ trống
    const boardMatrix = Array(15).fill(null).map(() => Array(15).fill(null));
    
    // Điền các nước đi vào ma trận
    if (movesString && movesString.trim() !== "") {
        const movesArray = movesString.split('|');
        movesArray.forEach((moveStr, index) => {
            const [r, c] = moveStr.split(',').map(Number);
            if (!isNaN(r) && !isNaN(c)) {
                boardMatrix[r][c] = (index % 2 === 0) ? "black" : "white";
            }
        });
    }
    
    // Render các ô cờ ra HTML hiển thị ngoài Web
    for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 15; c++) {
            const cell = document.createElement('div');
            cell.className = 'board-cell';
            
            if (boardMatrix[r][c]) {
                const piece = document.createElement('div');
                piece.className = `chess-piece ${boardMatrix[r][c]}`;
                cell.appendChild(piece);
            }
            
            boardElement.appendChild(cell);
        }
    }
}

// Xử lý tự động đặt quân cờ cho các Bot (Giả lập đánh thực tế)
function handleBotLogic(roomId, roomData) {
    if (botIntervals[roomId]) {
        clearTimeout(botIntervals[roomId]);
    }
    
    // Nếu phòng đang trong trạng thái chơi, tiến hành tính toán nước đi tiếp theo cho Bot theo lượt
    if (roomData.status === "playing") {
        botIntervals[roomId] = setTimeout(() => {
            // Lấy danh sách nước đi hiện tại
            let currentMoves = roomData.moves ? roomData.moves.split('|').filter(x => x !== "") : [];
            
            // Nếu bàn cờ đã đầy hoặc vượt quá 225 ô thì tự động reset ván mới
            if (currentMoves.length >= 225) {
                database.ref(`rooms/${roomId}`).update({
                    moves: "",
                    turn: "p1"
                });
                return;
            }
            
            // Tìm ngẫu nhiên một tọa độ trống chưa được đánh
            let r, c, moveKey;
            let isDuplicate = true;
            
            while (isDuplicate) {
                r = Math.floor(Math.random() * 15);
                c = Math.floor(Math.random() * 15);
                moveKey = `${r},${c}`;
                isDuplicate = currentMoves.includes(moveKey);
                
                // Trường hợp khẩn cấp nếu vòng lặp kẹt
                if (currentMoves.length === 0) break;
            }
            
            currentMoves.push(moveKey);
            const nextTurn = roomData.turn === "p1" ? "p2" : "p1";
            
            // Đẩy nước đi mới lên Firebase để tất cả người xem đồng bộ màn hình cùng lúc
            database.ref(`rooms/${roomId}`).update({
                moves: currentMoves.join('|'),
                turn: nextTurn
            });
            
        }, Math.floor(1500 + Math.random() * 1500)); // Thời gian Bot suy nghĩ ngẫu nhiên từ 1.5s - 3s
    }
}