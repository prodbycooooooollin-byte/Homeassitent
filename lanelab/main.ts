// Lanelab: solo training modes for Deadlock. Aim Range, Last-Hit Lab,
// Checkpoint Rush, Flow Meter, Route Studio, Duel Ladder and sandbox tools.
// Everything also works from chat: type /help.
import { command as rawCommand, log, onDamage, onDamaged, onFrame, onStart, onWorld, type Player } from 'modlock'

import { Hub } from './hub'

const hub = new Hub()

/** command registers a chat command and logs every use, so the terminal shows what arrived. */
function command(name: string, handler: (player: Player, args: string) => void): void {
  rawCommand(name, (player, args) => {
    log(`command /${name} ${args} from slot ${player.slot}`)
    handler(player, args)
  })
}

onStart(() => {
  log('Lanelab started')
  hub.start()
})
onWorld((map) => {
  log(`Lanelab world loaded: ${map}`)
  hub.world()
})
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
command('help', (player) => hub.help(player))
command('ui', (player, args) => hub.setDisplay(player, args))
