// Lanelab: solo training modes for Deadlock. Aim Range, Last-Hit Lab,
// Checkpoint Rush, Flow Meter, Route Studio, Duel Ladder and sandbox tools.
// Everything also works from chat: type /help.
import { command, onDamage, onDamaged, onFrame, onStart, onWorld, toast } from 'modlock'

import { Hub } from './hub'
import { SCENARIOS } from './lib/scenarios'

const hub = new Hub()

onStart(() => hub.start())
onWorld(() => hub.world())
onDamage((hit) => hub.hit(hit))
onDamaged((hit) => hub.damaged(hit))
onFrame((frame) => hub.frame(frame.timeSeconds))

command('menu', (player) => hub.setMenu(player, 'toggle'))
command('lanelab', (player) => hub.setMenu(player, 'toggle'))
command('aim', (player, args) => hub.startById(player, 'aim', args.trim()))
command('lasthit', (player) => hub.startById(player, 'lasthit'))
command('rush', (player) => hub.startById(player, 'rush'))
command('flow', (player) => hub.startById(player, 'flow'))
command('duel', (player) => hub.startById(player, 'duel'))
command('hero', (player, args) => hub.pickHero(player, args.trim()))
command('stop', (player) => hub.stopMode(player))
command('route', (player, args) => hub.route(player, args.trim().split(/\s+/)[0] || 'list'))
command('dps', (player) => hub.tool(player, 'dps'))
command('refill', (player) => hub.tool(player, 'refill'))
command('souls', (player, args) => hub.tool(player, 'souls', args.trim()))
command('bot', (player, args) => hub.tool(player, 'bot', args))
command('nobots', (player) => hub.tool(player, 'nobots'))
command('clean', (player) => hub.tool(player, 'clean'))
command('help', (player) => {
  toast(player, '/menu · /aim [' + SCENARIOS.map((s) => s.id).join('|') + '] · /lasthit · /rush · /flow · /duel · /hero <name> · /stop', 12)
  toast(player, '/route add|undo|clear|run · /dps · /refill · /souls [n] · /bot [hero] [fight] · /nobots', 12)
})
