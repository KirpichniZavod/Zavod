import { type NextRequest, NextResponse } from "next/server"
import { createErrorHandler } from "../../../src/utils/safe-storage"
import { rooms, players } from "../rooms/route"

// Роли игры
const ROLES = ["civilian", "mafia", "sheriff", "doctor", "lover", "don"] as const
type Role = (typeof ROLES)[number]

// Назначение ролей
function assignRoles(playerIds: string[], playerCount: number): Record<string, Role> {
  const roles: Record<string, Role> = {}
  const shuffledPlayers = [...playerIds].sort(() => Math.random() - 0.5)

  const mafiaCount = playerCount === 10 ? 3 : Math.max(1, Math.floor(playerCount / 4))
  let roleIndex = 0

  // Назначаем мафию
  for (let i = 0; i < mafiaCount; i++) {
    if (i === 0 && mafiaCount > 1) {
      roles[shuffledPlayers[roleIndex]] = "don"
    } else {
      roles[shuffledPlayers[roleIndex]] = "mafia"
    }
    roleIndex++
  }

  // Назначаем шерифа
  if (roleIndex < shuffledPlayers.length) {
    roles[shuffledPlayers[roleIndex]] = "sheriff"
    roleIndex++
  }

  // Назначаем доктора (если игроков больше 6)
  if (playerCount > 6 && roleIndex < shuffledPlayers.length) {
    roles[shuffledPlayers[roleIndex]] = "doctor"
    roleIndex++
  }

  // Назначаем любовницу (если игроков больше 8)
  if (playerCount > 8 && roleIndex < shuffledPlayers.length) {
    roles[shuffledPlayers[roleIndex]] = "lover"
    roleIndex++
  }

  // Остальные становятся мирными жителями
  for (let i = roleIndex; i < shuffledPlayers.length; i++) {
    roles[shuffledPlayers[i]] = "civilian"
  }

  return roles
}

// Получение названия роли
function getRoleName(role: string): string {
  switch (role) {
    case "civilian":
      return "Мирный житель"
    case "mafia":
      return "Мафия"
    case "sheriff":
      return "Шериф"
    case "doctor":
      return "Доктор"
    case "lover":
      return "Любовница"
    case "don":
      return "Дон мафии"
    default:
      return "Неизвестно"
  }
}

// Проверка условий победы
function checkWinCondition(gamePlayers: any[]): "mafia" | "civilians" | null {
  const livingPlayers = gamePlayers.filter((p) => p.isAlive)
  const livingMafia = livingPlayers.filter((p) => p.role === "mafia" || p.role === "don")
  const livingCivilians = livingPlayers.filter((p) => p.role !== "mafia" && p.role !== "don")

  if (livingMafia.length >= livingCivilians.length && livingMafia.length > 0) {
    return "mafia"
  }

  if (livingMafia.length === 0) {
    return "civilians"
  }

  return null
}

// Обновление таймера - ИСПРАВЛЕНО для стабильной работы
function updateTimer(room: any) {
  if (!room.gameState || room.gameState.timer === null || !room.gameState.timerStart) return

  const now = Date.now()
  const elapsed = Math.floor((now - room.gameState.timerStart) / 1000)
  const remaining = Math.max(0, room.gameState.timer - elapsed)

  // Обновляем currentTimer только если значение изменилось
  if (room.gameState.currentTimer !== remaining) {
    room.gameState.currentTimer = remaining

    // Если таймер истек, переходим к следующей фазе
    if (remaining === 0 && room.gameState.timer > 0) {
      processPhaseTransition(room)
    }
  }
}

// Переход между фазами
function processPhaseTransition(room: any) {
  const gameState = room.gameState

  console.log(`⏰ Phase transition from ${gameState.phase}`)

  switch (gameState.phase) {
    case "day":
      gameState.phase = "voting"
      gameState.timer = 15
      gameState.timerStart = Date.now()
      gameState.currentTimer = 15
      gameState.messages.push({
        id: `system-${Date.now()}`,
        playerId: "system",
        text: "Время обсуждения истекло! Начинается голосование.",
        timestamp: Date.now(),
        isSystem: true,
      })
      break

    case "voting":
      processVoting(gameState)
      break

    case "last-word":
      processLastWord(gameState)
      break

    case "mafia-turn":
      gameState.phase = "sheriff-turn"
      gameState.timer = 10
      gameState.timerStart = Date.now()
      gameState.currentTimer = 10
      break

    case "sheriff-turn":
      const hasDoctor = gameState.players.some((p: any) => p.role === "doctor" && p.isAlive)
      if (hasDoctor) {
        gameState.phase = "doctor-turn"
        gameState.timer = 10
        gameState.timerStart = Date.now()
        gameState.currentTimer = 10
      } else {
        startNewDay(gameState)
      }
      break

    case "doctor-turn":
      startNewDay(gameState)
      break

    case "lover-turn":
      gameState.phase = "mafia-turn"
      gameState.timer = 15
      gameState.timerStart = Date.now()
      gameState.currentTimer = 15
      break
  }
}

// Обработка голосования
function processVoting(gameState: any) {
  const voteCounts: Record<string, number> = {}
  Object.values(gameState.votes).forEach((targetId: any) => {
    voteCounts[targetId] = (voteCounts[targetId] || 0) + 1
  })

  let maxVotes = 0
  let eliminatedId: string | null = null

  Object.entries(voteCounts).forEach(([id, count]) => {
    if (count > maxVotes) {
      maxVotes = count
      eliminatedId = id
    }
  })

  if (eliminatedId && maxVotes > 1) {
    const eliminatedPlayer = gameState.players.find((p: any) => p.id === eliminatedId)
    if (eliminatedPlayer) {
      gameState.eliminatedPlayer = eliminatedPlayer
      gameState.phase = "last-word"
      gameState.timer = 30
      gameState.timerStart = Date.now()
      gameState.currentTimer = 30
      gameState.votes = {}

      gameState.messages.push({
        id: `system-${Date.now()}`,
        playerId: "system",
        text: `${eliminatedPlayer.name} был исключен голосованием. Последнее слово...`,
        timestamp: Date.now(),
        isSystem: true,
      })
    }
  } else {
    // Никто не исключен
    const hasLover = gameState.players.some((p: any) => p.role === "lover" && p.isAlive)
    gameState.phase = hasLover ? "lover-turn" : "mafia-turn"
    gameState.timer = 10
    gameState.timerStart = Date.now()
    gameState.currentTimer = 10
    gameState.votes = {}
    gameState.eliminatedPlayer = null

    gameState.messages.push({
      id: `system-${Date.now()}`,
      playerId: "system",
      text: "Никто не был исключен в результате голосования.",
      timestamp: Date.now(),
      isSystem: true,
    })
  }
}

// Обработка последнего слова
function processLastWord(gameState: any) {
  if (gameState.eliminatedPlayer) {
    // Убиваем исключенного игрока
    gameState.players = gameState.players.map((p: any) => {
      if (p.id === gameState.eliminatedPlayer?.id) {
        return { ...p, isAlive: false }
      }
      return p
    })

    const winner = checkWinCondition(gameState.players)
    if (winner) {
      gameState.phase = "game-over"
      gameState.winner = winner
      gameState.timer = null
      gameState.timerStart = null
      gameState.currentTimer = null

      gameState.messages.push({
        id: `system-${Date.now()}`,
        playerId: "system",
        text:
          winner === "mafia"
            ? "Мафия победила! Они устранили всех мирных жителей."
            : "Мирные жители победили! Вся мафия устранена.",
        timestamp: Date.now(),
        isSystem: true,
      })
    } else {
      // Переходим к ночи
      const hasLover = gameState.players.some((p: any) => p.role === "lover" && p.isAlive)
      gameState.phase = hasLover ? "lover-turn" : "mafia-turn"
      gameState.timer = 10
      gameState.timerStart = Date.now()
      gameState.currentTimer = 10

      gameState.messages.push({
        id: `system-${Date.now()}`,
        playerId: "system",
        text: hasLover
          ? "Наступила ночь. Любовница выбирает свою жертву..."
          : "Наступила ночь. Мафия выбирает жертву...",
        timestamp: Date.now(),
        isSystem: true,
      })
    }
  }
}

// Начало нового дня
function startNewDay(gameState: any) {
  let killedPlayer: any = null
  const isProtected = gameState.protectedPlayer === gameState.selectedPlayer

  // Обрабатываем убийство мафии
  if (gameState.selectedPlayer && !isProtected) {
    const victim = gameState.players.find((p: any) => p.id === gameState.selectedPlayer)
    if (victim && victim.isAlive) {
      killedPlayer = victim
      gameState.players = gameState.players.map((p: any) => {
        if (p.id === gameState.selectedPlayer) {
          return { ...p, isAlive: false }
        }
        return p
      })
    }
  }

  // Показываем результаты ночи
  if (gameState.eliminatedPlayer) {
    gameState.messages.push({
      id: `system-${Date.now()}`,
      playerId: "system",
      text: `Вчера был исключен ${gameState.eliminatedPlayer.name}. Его роль: ${getRoleName(gameState.eliminatedPlayer.role)}.`,
      timestamp: Date.now(),
      isSystem: true,
    })
  }

  if (killedPlayer) {
    gameState.messages.push({
      id: `system-${Date.now()}`,
      playerId: "system",
      text: `${killedPlayer.name} был убит ночью. Его роль: ${getRoleName(killedPlayer.role)}.`,
      timestamp: Date.now(),
      isSystem: true,
    })
  } else if (gameState.selectedPlayer && isProtected) {
    gameState.messages.push({
      id: `system-${Date.now()}`,
      playerId: "system",
      text: "Доктор спас жизнь этой ночью!",
      timestamp: Date.now(),
      isSystem: true,
    })
  } else {
    gameState.messages.push({
      id: `system-${Date.now()}`,
      playerId: "system",
      text: "Этой ночью никто не погиб.",
      timestamp: Date.now(),
      isSystem: true,
    })
  }

  const winner = checkWinCondition(gameState.players)
  if (winner) {
    gameState.phase = "game-over"
    gameState.winner = winner
    gameState.timer = null
    gameState.timerStart = null
    gameState.currentTimer = null

    gameState.messages.push({
      id: `system-${Date.now()}`,
      playerId: "system",
      text:
        winner === "mafia"
          ? "Мафия победила! Они устранили всех мирных жителей."
          : "Мирные жители победили! Вся мафия устранена.",
      timestamp: Date.now(),
      isSystem: true,
    })
  } else {
    gameState.phase = "day"
    gameState.day = gameState.day + 1
    gameState.timer = 30
    gameState.timerStart = Date.now()
    gameState.currentTimer = 30
    gameState.selectedPlayer = null
    gameState.protectedPlayer = null
    gameState.sheriffChecked = null
    gameState.loverTarget = null
    gameState.eliminatedPlayer = null
    gameState.killedPlayer = killedPlayer

    gameState.messages.push({
      id: `system-${Date.now()}`,
      playerId: "system",
      text: `День ${gameState.day}. У вас 30 секунд на обсуждение.`,
      timestamp: Date.now(),
      isSystem: true,
    })
  }
}

// Функция для фильтрации ролей (только админ видит все роли)
function filterPlayerRoles(players: any[], requestingPlayerId: string, isAdmin: boolean) {
  return players.map((player) => {
    // Админ видит все роли
    if (isAdmin) {
      return player
    }

    // Игрок видит только свою роль
    if (player.id === requestingPlayerId || player.clientId === requestingPlayerId) {
      return player
    }

    // Остальным игрокам роли не показываем
    return {
      ...player,
      role: undefined,
    }
  })
}

// GET - получить состояние игры
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get("roomId")
    const playerId = searchParams.get("playerId")

    if (!roomId || !playerId) {
      return NextResponse.json({ success: false, error: "Отсутствуют параметры" })
    }

    const room = rooms.get(roomId)
    const player = players.get(playerId)

    if (!room) {
      return NextResponse.json({ success: false, error: "Комната не найдена" })
    }

    if (!player) {
      return NextResponse.json({ success: false, error: "Игрок не найден" })
    }

    // Обновляем время последней активности
    player.lastSeen = Date.now()
    room.lastUpdate = Date.now()

    // Если игра началась, но состояние игры не создано, создаем его
    if (room.status === "playing" && !room.gameState) {
      console.log(`🎮 Creating game state for room ${roomId}`)

      // Назначаем роли только реальным игрокам
      const roleAssignments = assignRoles(room.players, room.players.length)

      // Обновляем роли в глобальном хранилище игроков
      room.players.forEach((pid) => {
        const p = players.get(pid)
        if (p) {
          p.role = roleAssignments[pid] || "civilian"
          p.isAlive = true
        }
      })

      // Создаем игроков для игры (только реальные игроки)
      const gamePlayers = room.players
        .map((pid: string) => {
          const p = players.get(pid)
          return p
            ? {
                id: p.id,
                name: p.name,
                role: p.role || "civilian",
                isAlive: true,
                avatar: "",
                isHost: p.isHost,
                clientId: p.id,
                isSeduced: false,
                canVote: true,
                canUseAbility: true,
              }
            : null
        })
        .filter(Boolean)

      room.gameState = {
        players: gamePlayers,
        phase: "day",
        day: 1,
        timer: 30,
        timerStart: Date.now(),
        currentTimer: 30,
        votes: {},
        selectedPlayer: null,
        eliminatedPlayer: null,
        killedPlayer: null,
        winner: null,
        checkedPlayers: {},
        protectedPlayer: null,
        sheriffChecked: null,
        loverTarget: null,
        seducedPlayer: null,
        messages: [
          {
            id: `system-${Date.now()}`,
            playerId: "system",
            text: "Игра началась! Наступил день 1. У вас 30 секунд на обсуждение.",
            timestamp: Date.now(),
            isSystem: true,
          },
        ],
        mafiaMessages: [],
      }

      console.log(`✅ Game state created for room ${roomId}`)
    }

    // Обновляем таймер
    if (room.gameState) {
      updateTimer(room)
    }

    // Проверяем, является ли игрок админом
    const isAdmin = player.name === "Udav"

    // Фильтруем роли игроков
    let filteredPlayers = room.gameState?.players || []
    if (room.gameState) {
      filteredPlayers = filterPlayerRoles(room.gameState.players, playerId, isAdmin)
    }

    return NextResponse.json({
      success: true,
      room: {
        id: room.id,
        name: room.name,
        status: room.status,
        maxPlayers: room.maxPlayers || 8,
        players: room.players
          .map((pid: string) => {
            const p = players.get(pid)
            return p
              ? {
                  id: p.id,
                  name: p.name,
                  isHost: p.isHost,
                }
              : null
          })
          .filter(Boolean),
        gameState: room.gameState
          ? {
              ...room.gameState,
              players: filteredPlayers,
            }
          : null,
        lastUpdate: room.lastUpdate,
      },
      player: {
        id: player.id,
        name: player.name,
        isHost: player.isHost,
        isAdmin: isAdmin,
      },
    })
  } catch (error) {
    console.error("❌ GET /api/game error:", error)
    const errorHandler = createErrorHandler("GET /api/game")
    return NextResponse.json(errorHandler(error))
  }
}

// POST - обработать действие игрока
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { roomId, playerId, action, data } = body

    console.log(`📨 POST /api/game - Action: ${action} from player ${playerId} in room ${roomId}`)

    if (!roomId || !playerId) {
      return NextResponse.json({ success: false, error: "Отсутствуют обязательные параметры" })
    }

    const room = rooms.get(roomId)
    const player = players.get(playerId)

    if (!room || !player) {
      return NextResponse.json({ success: false, error: "Комната или игрок не найдены" })
    }

    if (!room.gameState) {
      return NextResponse.json({ success: false, error: "Игра не началась" })
    }

    const gameState = room.gameState
    player.lastSeen = Date.now()
    room.lastUpdate = Date.now()

    // Обрабатываем действия игрока
    switch (action) {
      case "selectPlayer":
        if (data?.playerId) {
          gameState.selectedPlayer = data.playerId
          console.log(`🎯 Player ${playerId} selected target ${data.playerId}`)
        }
        break

      case "vote":
        if (data?.targetId) {
          if (data.isMafiaVote) {
            gameState.mafiaVotes = gameState.mafiaVotes || {}
            gameState.mafiaVotes[playerId] = data.targetId
            console.log(`🗳️ Mafia vote: ${playerId} -> ${data.targetId}`)
          } else {
            gameState.votes = gameState.votes || {}
            gameState.votes[playerId] = data.targetId
            console.log(`🗳️ Vote: ${playerId} -> ${data.targetId}`)
          }
        }
        break

      case "sendMessage":
        if (data?.text) {
          const newMessage = {
            id: `msg-${Date.now()}-${Math.random()}`,
            playerId: playerId,
            text: data.text,
            timestamp: Date.now(),
          }

          if (data.isMafiaChat) {
            gameState.mafiaMessages = gameState.mafiaMessages || []
            gameState.mafiaMessages.push(newMessage)
            console.log(`💬 Mafia message from ${playerId}: ${data.text}`)
          } else {
            gameState.messages = gameState.messages || []
            gameState.messages.push(newMessage)
            console.log(`💬 Public message from ${playerId}: ${data.text}`)
          }
        }
        break

      case "nextPhase":
        if (gameState.phase === "day") {
          gameState.phase = "voting"
          gameState.timer = 15
          gameState.timerStart = Date.now()
          gameState.currentTimer = 15
          gameState.messages.push({
            id: `system-${Date.now()}`,
            playerId: "system",
            text: "Начинается голосование. У вас 15 секунд, чтобы выбрать, кого вы считаете мафией.",
            timestamp: Date.now(),
            isSystem: true,
          })
          console.log(`⏭️ Phase changed to voting by ${playerId}`)
        }
        break

      case "doctorProtect":
        if (data?.playerId) {
          gameState.protectedPlayer = data.playerId
          gameState.doctorTarget = data.playerId
          console.log(`🛡️ Doctor protected ${data.playerId}`)
        }
        break

      case "sheriffCheck":
        if (data?.playerId) {
          gameState.sheriffChecked = data.playerId
          gameState.checkedPlayers = gameState.checkedPlayers || {}
          const targetPlayer = gameState.players.find((p: any) => p.id === data.playerId)
          if (targetPlayer) {
            gameState.checkedPlayers[data.playerId] = targetPlayer.role
            console.log(`🔍 Sheriff checked ${data.playerId}: ${targetPlayer.role}`)
          }
        }
        break

      case "loverSeduce":
        if (data?.playerId) {
          gameState.loverTarget = data.playerId
          console.log(`💋 Lover seduced ${data.playerId}`)
        }
        break

      case "donCheck":
        if (data?.playerId) {
          gameState.checkedPlayers = gameState.checkedPlayers || {}
          const targetPlayer = gameState.players.find((p: any) => p.id === data.playerId)
          if (targetPlayer) {
            gameState.checkedPlayers[data.playerId] = targetPlayer.role
            console.log(`👑 Don checked ${data.playerId}: ${targetPlayer.role}`)
          }
        }
        break

      // Админские действия
      case "adminKick":
        if (data?.playerId) {
          // Проверяем, что действие выполняет админ
          if (player.name === "Udav") {
            // Удаляем игрока из игры
            gameState.players = gameState.players.filter((p: any) => p.id !== data.playerId)

            // Удаляем из комнаты
            room.players = room.players.filter((id: string) => id !== data.playerId)

            // Удаляем из глобального списка игроков
            players.delete(data.playerId)

            // Добавляем системное сообщение
            gameState.messages.push({
              id: `system-${Date.now()}`,
              playerId: "system",
              text: `Игрок был исключен администратором.`,
              timestamp: Date.now(),
              isSystem: true,
            })

            console.log(`👮 Admin ${playerId} kicked player ${data.playerId}`)

            // Проверяем условия победы после исключения
            const winner = checkWinCondition(gameState.players)
            if (winner) {
              gameState.phase = "game-over"
              gameState.winner = winner
              gameState.timer = null
              gameState.timerStart = null
              gameState.currentTimer = null

              gameState.messages.push({
                id: `system-${Date.now()}`,
                playerId: "system",
                text:
                  winner === "mafia"
                    ? "Мафия победила! Они устранили всех мирных жителей."
                    : "Мирные жители победили! Вся мафия устранена.",
                timestamp: Date.now(),
                isSystem: true,
              })
            }
          }
        }
        break

      case "adminEndGame":
        // Проверяем, что действие выполняет админ
        if (player.name === "Udav") {
          gameState.phase = "game-over"
          gameState.winner = null
          gameState.timer = null
          gameState.timerStart = null
          gameState.currentTimer = null

          gameState.messages.push({
            id: `system-${Date.now()}`,
            playerId: "system",
            text: "Игра была принудительно завершена администратором.",
            timestamp: Date.now(),
            isSystem: true,
          })

          console.log(`👮 Admin ${playerId} ended the game`)
        }
        break

      default:
        console.log(`❓ Unknown action: ${action}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("❌ POST /api/game error:", error)
    const errorHandler = createErrorHandler("POST /api/game")
    return NextResponse.json(errorHandler(error))
  }
}
