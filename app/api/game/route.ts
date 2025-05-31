import { type NextRequest, NextResponse } from "next/server"
import { createErrorHandler } from "../../../src/utils/safe-storage"

// Используем то же хранилище что и в rooms
const rooms = new Map<string, any>()
const players = new Map<string, any>()

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

// Логика игры на сервере
function processGameLogic(room: any) {
  if (!room.gameState) return

  const gameState = room.gameState

  // Обработка голосования
  if (gameState.phase === "voting") {
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
  if (gameState.phase === "last-word" && gameState.eliminatedPlayer) {
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

  // Обработка ночных действий
  if (gameState.phase === "mafia-turn") {
    // Переходим к шерифу
    gameState.phase = "sheriff-turn"
    gameState.timer = 10

    gameState.messages.push({
      id: `system-${Date.now()}`,
      playerId: "system",
      text: "Шериф проводит расследование...",
      timestamp: Date.now(),
      isSystem: true,
    })
  }

  if (gameState.phase === "sheriff-turn") {
    const hasDoctor = gameState.players.some((p: any) => p.role === "doctor" && p.isAlive)

    if (hasDoctor) {
      gameState.phase = "doctor-turn"
      gameState.timer = 10

      gameState.messages.push({
        id: `system-${Date.now()}`,
        playerId: "system",
        text: "Доктор выбирает, кого защитить...",
        timestamp: Date.now(),
        isSystem: true,
      })
    } else {
      // Переходим к новому дню
      startNewDay(gameState)
    }
  }

  if (gameState.phase === "doctor-turn") {
    // Переходим к новому дню
    startNewDay(gameState)
  }

  if (gameState.phase === "lover-turn") {
    // Применяем эффект соблазнения
    gameState.players = gameState.players.map((player: any) => {
      const resetPlayer = {
        ...player,
        isSeduced: false,
        canVote: true,
        canUseAbility: true,
      }

      if (gameState.loverTarget && player.id === gameState.loverTarget) {
        return {
          ...resetPlayer,
          isSeduced: true,
          canVote: false,
          canUseAbility: false,
        }
      }

      return resetPlayer
    })

    gameState.seducedPlayer = gameState.loverTarget
    gameState.phase = "mafia-turn"
    gameState.timer = 15

    gameState.messages.push({
      id: `system-${Date.now()}`,
      playerId: "system",
      text: "Мафия выбирает жертву...",
      timestamp: Date.now(),
      isSystem: true,
    })
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

// GET - получить состояние игры
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get("roomId")
    const playerId = searchParams.get("playerId")

    console.log(`GET /api/game - roomId: ${roomId}, playerId: ${playerId}`)

    if (!roomId || !playerId) {
      console.log("Missing parameters")
      return NextResponse.json({ success: false, error: "Отсутствуют параметры" })
    }

    const room = rooms.get(roomId)
    const player = players.get(playerId)

    if (!room) {
      console.log(`Room not found: ${roomId}`)
      return NextResponse.json({ success: false, error: "Комната не найдена" })
    }

    if (!player) {
      console.log(`Player not found: ${playerId}`)
      return NextResponse.json({ success: false, error: "Игрок не найден" })
    }

    // Обновляем время последней активности
    player.lastSeen = Date.now()
    room.lastUpdate = Date.now()

    // Если игра началась, но состояние игры не создано, создаем его
    if (room.status === "playing" && !room.gameState) {
      console.log(`Creating game state for room ${roomId}`)

      // Назначаем роли только реальным игрокам
      const roleAssignments = assignRoles(room.players, room.players.length)

      // Создаем игроков для игры (только реальные игроки)
      const gamePlayers = room.players
        .map((pid: string) => {
          const p = players.get(pid)
          return p
            ? {
                id: p.id,
                name: p.name,
                role: roleAssignments[p.id] || "civilian",
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
    }

    // Обрабатываем логику игры
    if (room.gameState) {
      processGameLogic(room)
    }

    console.log(`Returning game state for room ${roomId}`)
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
        gameState: room.gameState,
        lastUpdate: room.lastUpdate,
      },
      player: {
        id: player.id,
        name: player.name,
        isHost: player.isHost,
      },
    })
  } catch (error) {
    const errorHandler = createErrorHandler("GET /api/game")
    return NextResponse.json(errorHandler(error))
  }
}

// POST - обработать действие игрока
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { roomId, playerId, action, data } = body

    console.log(`POST /api/game - Action: ${action} from player ${playerId} in room ${roomId}`)

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
        }
        break

      case "vote":
        if (data?.targetId) {
          if (data.isMafiaVote) {
            gameState.mafiaVotes = gameState.mafiaVotes || {}
            gameState.mafiaVotes[playerId] = data.targetId
          } else {
            gameState.votes = gameState.votes || {}
            gameState.votes[playerId] = data.targetId
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
          } else {
            gameState.messages = gameState.messages || []
            gameState.messages.push(newMessage)
          }
        }
        break

      case "nextPhase":
        if (gameState.phase === "day") {
          gameState.phase = "voting"
          gameState.timer = 15
          gameState.messages.push({
            id: `system-${Date.now()}`,
            playerId: "system",
            text: "Начинается голосование. У вас 15 секунд, чтобы выбрать, кого вы считаете мафией.",
            timestamp: Date.now(),
            isSystem: true,
          })
        }
        break

      case "doctorProtect":
        if (data?.playerId) {
          gameState.protectedPlayer = data.playerId
          gameState.doctorTarget = data.playerId
        }
        break

      case "sheriffCheck":
        if (data?.playerId) {
          gameState.sheriffChecked = data.playerId
          gameState.checkedPlayers = gameState.checkedPlayers || {}
          const targetPlayer = gameState.players.find((p: any) => p.id === data.playerId)
          if (targetPlayer) {
            gameState.checkedPlayers[data.playerId] = targetPlayer.role
          }
        }
        break

      case "loverSeduce":
        if (data?.playerId) {
          gameState.loverTarget = data.playerId
        }
        break

      case "donCheck":
        if (data?.playerId) {
          gameState.checkedPlayers = gameState.checkedPlayers || {}
          const targetPlayer = gameState.players.find((p: any) => p.id === data.playerId)
          if (targetPlayer) {
            gameState.checkedPlayers[data.playerId] = targetPlayer.role
          }
        }
        break

      // Админские действия
      case "adminKick":
        if (data?.playerId) {
          // Проверяем, что действие выполняет админ
          const adminPlayer = players.get(playerId)
          if (adminPlayer && adminPlayer.name === "Udav") {
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

            // Проверяем условия победы после исключения
            const winner = checkWinCondition(gameState.players)
            if (winner) {
              gameState.phase = "game-over"
              gameState.winner = winner
              gameState.timer = null

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
        const adminPlayer = players.get(playerId)
        if (adminPlayer && adminPlayer.name === "Udav") {
          gameState.phase = "game-over"
          gameState.winner = null
          gameState.timer = null

          gameState.messages.push({
            id: `system-${Date.now()}`,
            playerId: "system",
            text: "Игра была принудительно завершена администратором.",
            timestamp: Date.now(),
            isSystem: true,
          })
        }
        break

      default:
        console.log(`Unknown action: ${action}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const errorHandler = createErrorHandler("POST /api/game")
    return NextResponse.json(errorHandler(error))
  }
}
