namespace DeadlockTrainer;

sealed record QuizQuestion(string Text, string[] Options, int Correct, string Why);

/// <summary>Decision questions: what to buy, what to do. Answered by shooting an option in the menu.</summary>
static class QuizData {
	public static readonly QuizQuestion[] All = {
		new("Three enemies deal mostly BULLET damage.|You are the tank in front. Best defensive buy?",
			new[] { "Bullet Resilience", "Spirit Resilience", "Extra Spirit", "Fleet Feet" }, 0,
			"Resilience against the damage type that actually kills you beats everything else. Count what the enemy team deals."),
		new("Three enemies are casters and burn you with spirit damage.|What helps most?",
			new[] { "Bullet Resilience", "Spirit Resilience", "Extra Charge", "Rapid Rounds" }, 1,
			"Spirit Resilience reduces spirit damage. Bullet armor does nothing against ability damage."),
		new("You get chained by slows and stuns and die before you can act.|What do you buy?",
			new[] { "Debuff Remover", "More Ammo", "Extra Spirit", "Sprint Boots" }, 0,
			"Debuff Remover answers crowd control. More damage does not help if you cannot act."),
		new("A hero kills you with ONE ability combo you cannot dodge.|Which item answers a single enemy ability?",
			new[] { "Counterspell", "Extra Stamina", "Rapid Rounds", "Close Quarters" }, 0,
			"Counterspell blocks one incoming enemy ability - that is what the Counterspell trainer is for."),
		new("You hold 2400 unspent souls and a fight is about to start.|What is correct?",
			new[] { "Fight first, buy later", "Spend the souls first", "Save for the late game", "Ignore the souls" }, 1,
			"Unspent souls are lost power - and souls in your pocket are gone if you die. Buy before the fight."),
		new("You are 4000 souls ahead and their team is dead.|What do you do with the advantage?",
			new[] { "Farm the jungle quietly", "Push an objective and use the time", "Walk back to base", "Wait for them" }, 1,
			"A dead team is a window: take towers or objectives while they respawn. A lead only counts if you convert it."),
		new("You are at 25% health, a wave is coming, an enemy is close.|Best move?",
			new[] { "Fight on for the kill", "Retreat and heal first", "Dive their tower", "Stand still" }, 1,
			"At low health every trade is lost. Leave, heal, come back - a death gives the enemy souls."),
		new("You keep losing the lane to a poke hero because you have no sustain.|What helps?",
			new[] { "Healing Rite", "Rapid Rounds", "More ammo", "Nothing" }, 0,
			"Sustain lets you stay in lane. Poke wins by wearing you down - heal it back."),
		new("The enemy has no way to see you and your hero is a flanker.|Where do you start the fight?",
			new[] { "Straight at the front", "From the side or behind", "From far away only", "Wait at base" }, 1,
			"A flanker wants a different angle than the front line - fight where they cannot all reach you at once."),
		new("Their whole team is on the other side of the map, one of them is alone and hurt.|What do you do?",
			new[] { "Ignore him", "Go and kill him fast", "Wait for your team", "Go to base" }, 1,
			"A lone hurt enemy with the team far away is a free kill - pick him off before help arrives."),
	};
}
