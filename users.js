const users = []
const MAX_ROOM_SIZE = 10

const addUser = ({ id, room, name }) => {
    const usersInRoom = users.filter(u => u.room === room)
    if (usersInRoom.length >= MAX_ROOM_SIZE)
        return { error: 'Room full' }

    // Sanitize the requested name
    let baseName = (name || '').trim().slice(0, 16)
    if (!baseName) baseName = `Player ${usersInRoom.length + 1}`

    // Ensure uniqueness within the room (append suffix if taken)
    let assignedName = baseName
    let suffix = 2
    while (usersInRoom.find(u => u.name === assignedName)) {
        assignedName = `${baseName} ${suffix++}`
    }

    // First player in the room is the host
    const isHost = usersInRoom.length === 0

    const newUser = { id, name: assignedName, room, isHost }
    users.push(newUser)
    return { newUser }
}

const removeUser = id => {
    const removeIndex = users.findIndex(user => user.id === id)

    if(removeIndex!==-1)
        return users.splice(removeIndex, 1)[0]
}

const getUser = id => {
    return users.find(user => user.id === id)
}

const getUsersInRoom = room => {
    return users.filter(user => user.room === room)
}

module.exports = { addUser, removeUser, getUser, getUsersInRoom }