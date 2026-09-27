const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

const rooms = new Map();

const generateRoomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code;

  do {
    code = "";

    for (let i = 0; i < 6; i++) {
      code += chars[
        Math.floor(Math.random() * chars.length)
      ];
    }

  } while (rooms.has(code));

  return code;
};

function getRoom(roomCode) {
  return rooms.get(roomCode);
}

function publicPlayers(room) {
  return room.players.map(player => ({
    id: player.id,
    name: player.name,
    host: player.id === room.hostId
  }));
}

function sendRoomUpdate(room) {
  io.to(room.code).emit("roomUpdate", {
    room: room.code,
    players: publicPlayers(room)
  });
}

function removePlayerFromRoom(socket) {

  const roomCode = socket.data.room;

  if (!roomCode) return;

  const room = rooms.get(roomCode);

  if (!room) return;

  room.players =
    room.players.filter(
      player => player.id !== socket.id
    );

  socket.leave(roomCode);

  socket.data.room = null;

  if (room.players.length === 0) {

    rooms.delete(roomCode);

    return;
  }

  if (room.hostId === socket.id) {

    room.hostId =
      room.players[0].id;

    io.to(roomCode).emit(
      "hostChanged",
      {
        hostId: room.hostId,
        players: publicPlayers(room)
      }
    );
  }

  sendRoomUpdate(room);
}


io.on("connection", socket => {

  console.log(
    "Jugador conectado:",
    socket.id
  );


  socket.on("createRoom", data => {

    const name =
      String(data?.name || "Jugador")
        .trim()
        .slice(0, 18);

    const code =
      generateRoomCode();

    const room = {

      code,

      hostId: socket.id,

      players: [
        {
          id: socket.id,
          name: name || "Jugador"
        }
      ],

      gameStarted: false,

      gameState: null

    };

    rooms.set(
      code,
      room
    );

    socket.join(code);

    socket.data.room = code;

    socket.emit(
      "roomCreated",
      {
        room: code,
        players: publicPlayers(room)
      }
    );

  });


  socket.on("joinRoom", data => {

    const name =
      String(data?.name || "Jugador")
        .trim()
        .slice(0, 18);

    const code =
      String(data?.room || "")
        .trim()
        .toUpperCase();

    const room =
      getRoom(code);

    if (!room) {

      socket.emit(
        "roomError",
        "No existe esa sala."
      );

      return;
    }

    if (room.gameStarted) {

      socket.emit(
        "roomError",
        "La partida ya comenzó."
      );

      return;
    }

    if (room.players.length >= 8) {

      socket.emit(
        "roomError",
        "La sala está llena."
      );

      return;
    }

    if (
      room.players.some(
        p =>
          p.name.toLowerCase() ===
          name.toLowerCase()
      )
    ) {

      socket.emit(
        "roomError",
        "Ese nombre ya está siendo usado."
      );

      return;
    }

    room.players.push({
      id: socket.id,
      name: name || "Jugador"
    });

    socket.join(code);

    socket.data.room = code;

    socket.emit(
      "roomJoined",
      {
        room: code,
        players: publicPlayers(room)
      }
    );

    sendRoomUpdate(room);

  });


  socket.on("leaveRoom", () => {

    removePlayerFromRoom(socket);

  });


  socket.on("prepareGame", data => {

    const code =
      String(data?.room || "")
        .trim()
        .toUpperCase();

    const room =
      getRoom(code);

    if (!room) return;

    if (room.hostId !== socket.id) {

      socket.emit(
        "roomError",
        "Solo el anfitrión puede iniciar la partida."
      );

      return;
    }

    if (room.players.length < 2) {

      socket.emit(
        "roomError",
        "Se necesitan al menos 2 jugadores."
      );

      return;
    }

    room.gameStarted = true;

    room.gameState = null;

    io.to(code).emit(
      "gamePrepared",
      {
        room: code,

        settings: {
          rounds:
            Number(data?.rounds) || 10,

          time:
            Number(data?.time) || 30
        }
      }
    );

  });


  socket.on("syncGame", state => {

    const roomCode =
      socket.data.room;

    if (!roomCode) return;

    const room =
      getRoom(roomCode);

    if (!room) return;

    if (room.hostId !== socket.id)
      return;

    room.gameState = state;

    socket
      .to(roomCode)
      .emit(
        "gameState",
        {
          state
        }
      );

  });


  socket.on("playerAction", data => {

    const roomCode =
      socket.data.room;

    const room =
      getRoom(roomCode);

    if (!room) return;

    const player =
      room.players.find(
        p =>
          p.id === socket.id
      );

    if (!player) return;

    socket.to(roomCode).emit(
      "onlinePlayerAction",
      {
        playerIndex:
          room.players.findIndex(
            p =>
              p.id === socket.id
          ),

        action:
          data?.action,

        value:
          data?.value
      }
    );

  });


  socket.on("disconnect", () => {

    console.log(
      "Jugador desconectado:",
      socket.id
    );

    removePlayerFromRoom(socket);

  });

});


app.get("/", (req, res) => {

  res.send(
    "Quick Word Online Server funcionando."
  );

});


server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Quick Word server escuchando en puerto ${PORT}`
    );

  }
);