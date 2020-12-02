let field;
let background;
let backgroundDirt;
let holeLayer;
let knownGoldLayer;
let hiddenGoldLayer;
let agentLayer;
let arrowsLayer;
let diamondLayer;
let fieldSize;
let thinkTime = 1*60*1000;	// default: 1 minute for each agent
const maxFieldSize = 20;
const minFieldSize = 6;
let fieldWidth, fieldHeight, topMargin;
let cellWidth, cellHeight, halfWidth, halfHeight;
let cells;
const topMarginRatio = 0.04;

let maxSteps;
let playUntil;
let playTempo = 60;
let frameRate = 30;
let stepInterval;
let numSubsteps;
let midStep;
let substepInterval;
let currentStep;
let substep = 0;

// Randomization Parameters
const params = {
  randomizeAgents: true,
  randomizeHoles: true,
  randomizeHidden: true,
  randomizeKnown: true,
  holeProb: 5,
  knownProb: 5,
  knownMax: 20,
  hiddenProb: 5,
  hiddenMax: 20
}

let backgroundColor = "rgb(100,70,40)";
let editingBackgroundColor = "rgb(120,120,120)";
let lawnColor = "rgb(40,150,40)";
let leftFenceColor = "rgb(190,190,190)";
let rightFenceColor = "rgb(220,220,220)";
let scoreColor = "rgb(255,255,0)";
let hiddenScoreColor = "rgb(255,64,0)";
let clockColor = "rgb(255,255,0)";
let endGameClockColor = "rgb(255,100,100)";
let lastRecordClockColor = "rgb(100,255,255)";
let speedColor = "rgb(100,255,255)";
let expiredColor = "rgb(255,0,0)";
let scores = [];
let timeLeftLabels = [];

// Image files
const holeImage = "../icons/hole.png";
let goldMax;			// For deciding which gold icon to use
const samuraiWidth = 250;
const samuraiHeight = 200;
const dogWidth = 125;
const dogHeight = 100;
const goldWidth = 200;
const goldHeight = 150;

const arrowImages = [
  "../icons/south.png",
  "../icons/sw.png",
  "../icons/west.png",
  "../icons/nw.png",
  "../icons/north.png",
  "../icons/ne.png",
  "../icons/east.png",
  "../icons/se.png"
];

const logoSizes = {
  platinum: 2.8, gold: 2.3, silver: 1.6, bronze: 1.0, supporter: 0.6
};
let leftLogos;
let rightLogos;
let leftLogoWidth;
let rightLogoWidth;

const barkSoundFile = '../sounds/bark.mp3';
const tickSoundFile = '../sounds/tick-mono.mp3';
const goldSoundFile = '../sounds/gold.mp3';
const scoopSoundFile = '../sounds/scoop-mono.mp3';
const plugSoundFile = '../sounds/plug-mono.mp3';
const beepSoundFile = '../sounds/beep.mp3';
const gongSoundFile = '../sounds/gong.mp3';

function createSVG(tag) {
  return document.createElementNS(field.namespaceURI, tag);
}

function removeAllChildren(node) {
  while (node.lastChild) node.removeChild(node.lastChild);
}

// AgentAttributes: Describes the permanent attribute of an agent
//   seq: Agent's sequence number
//     0, 1: samurai, 2, 3: dog,
//     0, 2: red team, 1, 3: blue team
//   image: SVG image element for the agent image
//   player: Player object that plans an action for each step

class AgentAttributes {
  constructor(seq, player) {
    this.seq = seq;
    this.player = player;
    this.image = createSVG('image');
  }
}

// agentState: Describes the current state of an agent
//   attributes: agentAttributes class objects, describing unchanging state
//   at: Cell on which the agent is (see below for cell records)
//   direction: Directions (0..7) of the agent
//   planned: Action the agent planned (may not be successful made)
//   action: Action actually taken
//   obtained: Amount of gold obtained

var conflictStart = false;

class AgentState {
  constructor(attributes, at, direction) {
    this.attributes = attributes;
    this.at = at;
    this.direction = direction;
    this.planned = -1;
    this.action = -1;
    this.obtained = 0;
  }
  reposition(init) {
    const isDog = this.attributes.seq >= 2;
    let x, y;
    if (init || (this.action < 0 && this.planned < 0)) {
      x = this.at.x; y = this.at.y;
    } else {
      let from, to;
      if (this.planned < 0 || this.planned >= 8) {
	from = to = this.at;
      } else {
	if (this.planned != this.action) {
	  conflictStart = true;
	  if (substep < midStep/2) {
	    from = this.at;
	    to = from.neighbors[(this.planned)%8];
	  } else {
	    to = this.at;
	    from = to.neighbors[(this.planned)%8];
	  } 
	} else {
	  to = this.at;
	  from = to.neighbors[(this.planned+4)%8];
	}
      }
      const ratio = Math.min(substep/midStep, 1);
      x = (1-ratio)*from.x + ratio*to.x;
      y = (1-ratio)*from.y + ratio*to.y;
    }
    this.setImage(x, y);
  }
}

class SamuraiState extends AgentState {
  constructor(attributes, at, direction, energy, digging) {
    super(attributes, at, direction);
    this.energy = energy;
    this.digging = digging;
  }
  duplicate() {
    return new SamuraiState(this.attributes, this.at, this.direction,
			    this.planned < 0 ? 1 : 0, 0);
  }
  setImage(x, y) {
    const teamColor = this.attributes.seq%2 == 0 ? "Red" : "Blue";
    const image = this.attributes.image;
    image.setAttribute(
      'href',
      "../icons/samurai" + teamColor +
	("0"+(24*this.energy+8*this.digging+this.direction)).
	slice(-2) + ".png");
    image.setAttribute(
      'x', (fieldSize+x-y)*cellWidth/2 - 2*cellWidth);
    image.setAttribute(
      'y', (x+y+1)*halfHeight + topMargin - 2.6*cellHeight);
    image.setAttribute('width', 4*cellWidth);
    image.setAttribute('height', 4*cellHeight);
  }
}

class DogState extends AgentState {
  constructor(attributes, at, direction, barking) {
    super(attributes, at, direction);
    this.barking = barking;
  }
  duplicate() {
    return new DogState(this.attributes, this.at, this.direction, 0);
  }
  setImage(x, y) {
    const teamColor = this.attributes.seq%2 == 0 ? "Red" : "Blue";
    const image = this.attributes.image;
    image.setAttribute(
      'href',
      "../icons/dog" + teamColor +
	("0"+
	 ((substep >= midStep ? 8 : 0)*this.barking+
	  this.direction)).slice(-2) +
	".png");
    image.setAttribute('x', (fieldSize+x-y)*cellWidth/2 - cellWidth);
    image.setAttribute('y', (x+y+1)*halfHeight + topMargin - 1.6*cellHeight);
    image.setAttribute('width', 2*cellWidth);
    image.setAttribute('height', 2*cellHeight);
  }
}

// Cell
//   Attributes of a cell that won't change as game proceeds
//   x, y: Cell coordinates
//   isCorner: Initial position of one of the agents
//   holeImage: SVG image element for a hole in the cell
//   diamond: SVG polygon element covering the cell area
//   cx, cy; Coordinates in the SVG
//   neighbors: Array of neighboring cells (8 elements)
//     null if the neighbor would be out of the field.

class Cell {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.neighbors = [];
    this.holeImage = createSVG('image');
    this.diamond = createSVG('polygon');
    const downListener = new DiamondDownListener(this);
    const enterListener = new DiamondEnterListener(this.diamond);
    const leaveListener = new DiamondLeaveListener(this.diamond);
    this.diamond.addEventListener('mouseenter', enterListener);
    this.diamond.addEventListener('mouseleave', leaveListener);
    this.diamond.addEventListener('mousedown', downListener);
    this.isCorner =
      (x == 0 || x == fieldSize-1) && (y == 0 || y == fieldSize-1)
    this.gold = 0;
    this.alreadyDug = false;
  }
  resize() {
    this.cx = (fieldSize+this.x-this.y)*cellWidth/2;
    this.cy = (this.x+this.y+1)*halfHeight + topMargin;
    this.top = this.cy-cellHeight/2+1;
    this.bottom = this.cy+cellHeight/2-1;
    this.left = this.cx-cellWidth/2+1;
    this.right = this.cx+cellWidth/2-1
    this.corners = 
      this.left+","+this.cy+" "+
      this.cx+","+this.top+" "+
      this.right+","+this.cy+" "+
      this.cx+","+this.bottom;
    const hole = this.holeImage;
    hole.setAttribute('x', this.cx-0.3*cellWidth);
    hole.setAttribute('y', this.cy-0.5*cellHeight);
    hole.setAttribute('width', 0.6*cellWidth);
    hole.setAttribute('height', 0.5*cellWidth);
    hole.setAttribute('href', holeImage);
    const diamond = this.diamond;
    diamond.setAttribute('points', this.corners);
    diamond.style.fill = "rgba(1,1,1,0)";
    diamond.style.strokeWidth = Math.max(2, cellWidth/20)+"px";
    diamond.style.stroke = "none";
    diamondLayer.appendChild(diamond);
  }
  setNeighbors() {
    const directions = [
      [0, 1], [-1, 1], [-1, 0], [-1, -1],
      [0, -1], [1, -1], [1, 0], [1, 1] ];
    for (let d = 0; d != 8; d++) {
      let nx = this.x + directions[d][0];
      let ny = this.y + directions[d][1];
      this.neighbors[d] =
        0 <= nx && nx < fieldSize && 0 <= ny && ny < fieldSize ?
        cells[nx][ny] : null;
    }
  }
}

const twoDigits = [
  "00", "01", "02", "03", "04", "05", "06", "07", "08", "09",
  "10", "11", "12", "13", "14", "15", "16", "17", "18", "19"
];

let manualAgent = -1;

function toggleManualPlay(ev) {
  stopAutoPlay();
  setManualPlay((manualAgent+2)%3 - 1);
  stepRecords[currentStep].redraw(true);
}

function setManualPlay(agent) {
  manualAgent = agent;
  const manualIcons = ["manual", "red-hand", "blue-hand"];
  manualButton.src = "../icons/" + manualIcons[manualAgent+1] + ".png";
}

function makeGoldImage(cell, known) {
  const amount = cell.gold;
  const image = createSVG('image');
  image.setAttribute('x', cell.cx-0.4*cellWidth);
  image.setAttribute('y', cell.cy-0.5*cellWidth);
  image.setAttribute('width', 0.8*cellWidth);
  image.setAttribute('height', 0.8*cellWidth);
  const figIndex =
	Math.floor(Math.min(10, Math.max(10*Math.abs(amount)/goldMax, 5)));
  image.setAttribute('href',
		     "../icons/gold" + ("0"+figIndex).slice(-2) + ".png");
  const amnt = createSVG('text');
  amnt.setAttribute('x', cell.cx);
  amnt.setAttribute('y', cell.cy);
  amnt.setAttribute('font-size', 0.3*cellWidth);
  amnt.setAttribute('font-family', 'roman');
  amnt.setAttribute('font-weight', 'bold');
  amnt.setAttribute('style', 'text-shadow:1px 1px black');
  amnt.setAttribute('text-anchor', 'middle');
  amnt.style.fill = known ? scoreColor : hiddenScoreColor;
  amnt.innerHTML = Math.abs(amount);
  amnt.style.pointerEvents = "none";
  const g = createSVG('g');
  g.appendChild(image);
  g.appendChild(amnt);
  cell.goldImage = g;
}

function randomConfig(init) {
  let config =
      init ? {
	size: 10, steps: 100, thinkTime: thinkTime,
      } : initialConfig();
  goldMax = Math.max(params.knownMax, params.hiddenMax);
  if (init || params.randomizeAgents) config.agents = [];
  if (init || params.randomizeHoles) config.holes = [];
  if (init || params.randomizeKnown) config.known = [];
  if (init || params.randomizeHidden) config.hidden = [];
  function randomVacancy() {
    let vacancies = [];
    for (let x = 0; x != config.size; x++) {
      for (let y = 0; y != config.size; y++) {
	if (!config.agents.some(a => a.x == x && a.y == y) &&
	    !config.holes.some(h => h.x == x && h.y == y) &&
	    !config.known.some(h => h.x == x && h.y == y) &&
	    !config.hidden.some(h => h.x == x && h.y == y)) {
	  vacancies.push({ x: x, y: y });
	}
      }
    }
    if (vacancies == []) return null;
    return vacancies[Math.floor(vacancies.length*random.gen())];
  }
  if (init || params.randomizeAgents) {
    for (let a = 0; a != 4; a++) {
      const pos = randomVacancy();
      let d = Math.floor(8*random.gen());
      if (a < 2) d = d & 6;
      config.agents.push({x: pos.x, y: pos.y, direction: d});
    }
  }
  if (init || params.randomizeHoles) {
    const numHoles =
	  Math.floor((config.size*config.size-4)*params.holeProb/100);
    for (let h = 0; h != numHoles; h++) {
      const pos = randomVacancy();
      if (pos == null) break;
      config.holes.push({x: pos.x, y: pos.y});
    }
  }
  if (init || params.randomizeKnown) {
    config.known = [];
    const numGolds =
	  Math.floor((config.size*config.size-4)*params.knownProb/100);
    for (let ng = 0; ng != numGolds; ng++) {
      const pos = randomVacancy();
      if (pos == null) break;
      const amount = 2*Math.floor(((params.knownMax-2)*random.gen()+1)/2) + 2;
      config.known.push({x: pos.x, y: pos.y, amount: amount});
    }
  }
  if (init || params.randomizeHidden) {
    config.hidden = [];
    const numGolds =
	  Math.floor((config.size*config.size-4)*params.hiddenProb/100);
    for (let ng = 0; ng != numGolds; ng++) {
      const pos = randomVacancy();
      if (pos == null) break;
      const amount = 2*Math.floor(((params.hiddenMax-2)*random.gen()+1)/2) + 2;
      config.hidden.push({x: pos.x, y: pos.y, amount: amount});
    }
  }
  return config;
}

// Game State Record for Each Game Step
//   stepNumber: Step sequence number (start from 0)
//   agents: Array of agent states
//   golds: Array of the amounts of gold already dug out (2 elems)
//   goldRemaining: Amount of gold not dug out yet
//   knownGolds: Array of info on *known* embedded golds
//   hiddenGolds: Array of cells with *hidden* embedded golds
//   holes: Array of cells with a hole
//   dug: Array of cells dug out in this step
//   plugged: Array of cells plugged in this step

class GameState {
  constructor(prevGameState, commandPlay, config) {
    if (prevGameState == null) {
      // The first step of a game; Initialize everything
      this.stepNumber = 0;
      this.dug = [];
      this.plugged = [];
      this.goldRemaining = 0;
      // Set holes
      this.holes = [];
      config.holes.forEach(h => this.holes.push(cells[h.x][h.y]));
      // Prepare golds
      this.knownGolds = [];
      this.hiddenGolds = [];
      config.known.forEach(g => {
        const cell = cells[g.x][g.y];
	cell.gold = g.amount;
        this.knownGolds.push(cell);
        this.goldRemaining += g.amount;
      });
      config.hidden.forEach(g => {
        const cell = cells[g.x][g.y];
	cell.gold = g.amount;
        this.hiddenGolds.push(cell);
        this.goldRemaining += g.amount;
      });
      this.golds = [0, 0];
      // Initialize agents and times left
      this.agents = [];
      this.timeLeft = [];
      for (let a = 0; a != 4; a++) {
        const agentPlayers = [
          new GreedySamurai(fieldSize, maxSteps),
          new GreedySamurai(fieldSize, maxSteps),
          new SnoopyDog(fieldSize, maxSteps),
          new SnoopyDog(fieldSize, maxSteps)
        ];
        const agent = config.agents[a];
	const attr = new AgentAttributes(a, agentPlayers[a]);
        this.agents.push(
	  a < 2 ?
            new SamuraiState(
	      attr, cells[agent.x][agent.y], agent.direction, 1, 0) :
	    new DogState(
	      attr, cells[agent.x][agent.y], agent.direction, 0));
	this.timeLeft[a] = config.thinkTime;
      }
    } else {
      this.stepNumber = prevGameState.stepNumber + 1;
      function invalidAction(role, agent, plan, targetPos, prev) {
	if (plan < -1 || plan >= 24)
	  return "Plan " + plan + " out of range";
        if (targetPos === null)
	  return "Target cell is out of the field";
	if (role < 2 && plan%2 != 0 && prev.agents[role].planned != -1) {
	  return "Diagonal move by a non-energized samurai";
	}
        if (role >= 2 && plan >= 8) return "Dig or plug by a dog";
	if (plan >= 0) {
	  for (let b = 0; b != 4; b++) {
	    if (prevGameState.agents[b].at == targetPos) {
	      return (plan < 8 ? "Moving to" : "Digging") +
	      " (" + targetPos.x + "," + targetPos.y +
	      ") occupied by agent " + b;
	    }
	  }
	}
	if (plan >= 8) {
	  if (plan < 16) {
            if (prevGameState.holes.includes(targetPos)) {
	      return "Trying to dig a cell already with a hole";
	    }
	  } else {
            if (!prevGameState.holes.includes(targetPos)) {
	      return "Trying to plug a non-existent hole";
	    }
	  }
	}
	return false;
      }
      // Copy cells, gold and hole info from the previous state
      this.goldRemaining = prevGameState.goldRemaining;
      this.holes = Array.from(prevGameState.holes);
      this.dug = [];
      this.plugged = [];
      this.hiddenGolds = Array.from(prevGameState.hiddenGolds);
      this.knownGolds = Array.from(prevGameState.knownGolds);
      this.golds = Array.from(prevGameState.golds);
      this.timeLeft = prevGameState.timeLeft.slice();
      // Plan actions
      const targets = [];
      const moveTo = [];
      // Decide plans of agents
      this.agents = [];
      const agentsAt = prevGameState.agents.map(agent => agent.at);
      const agentsPlanned = prevGameState.agents.map(agent => agent.planned);
      const agentsActions = prevGameState.agents.map(agent => agent.action);
      for (let a = 0; a != 4; a++) {
        const agent = prevGameState.agents[a];
        const newAgent = agent.duplicate();
        this.agents[a] = newAgent;
        const detectedGolds = [];
        if (a >= 2) {
          prevGameState.hiddenGolds.forEach(c => {
            if (agent.at.neighbors.includes(c)) {
              detectedGolds.push(c);
            }
          });
        }
	const planStart = performance.now();
        const plan =
	      Array.isArray(commandPlay) ? commandPlay[a] :
              (a == manualAgent && commandPlay !== undefined) ?
              commandPlay :
              agent.attributes.player.plan(
                a, currentStep, prevGameState.holes,
                prevGameState.knownGolds, detectedGolds,
		agentsAt, agentsPlanned, agentsActions,
		scores,
                prevGameState.goldRemaining
              );
	const planEnd = performance.now();
	this.timeLeft[a] = Math.max(0, this.timeLeft[a] - planEnd + planStart);
        const targetPos = agent.at.neighbors[plan%8];
        targets[a] = moveTo[a] = agent.at;
        newAgent.planned = plan;
        newAgent.action = -1;
        if (plan >= 0) {
	  const invalid =
		invalidAction(a, agent, plan, targetPos, prevGameState);
          if (!invalid) {
            targets[a] = targetPos;
	    if (plan < 8) moveTo[a] = targetPos;
            newAgent.direction = plan%8;
            newAgent.action = plan;
          } else {
	    console.log("In step "+this.stepNumber +
			"; agent "+ a +
			"@(" + agent.at.x + "," + agent.at.y + ")");
	    console.log(invalid);
            console.log("Action planned: ", plan);
          }
        }
      }
      ////////////////////////
      // Check operabilities
      ////////////////////////
      // Check crossing move lines
      for (let a = 0; a != 4; a++) {
	const agent = this.agents[a];
	const target = targets[a];
        for (let b = 0; b != 4; b++) {
	  if (a != b) {
	    const target2 = targets[b];
	    const agent2 = this.agents[b];
	    if ((agent.at.x == agent2.at.x &&
		 agent.at.y + target.y == agent2.at.y + target2.y) ||
		(agent.at.y == agent2.at.y &&
		 agent.at.x + target.x == agent2.at.x + target2.x)) {
	      if (a >= 2 || b < 2) {
		agent.action = -1;
		moveTo[a] = agent.at;
		break;
	      }
	    }
	  }
        }
      }
      // Check move or dig target conflicts
      const notViable = [];
      for (let a = 0; a != 4; a++) {
	notViable[a] = false;
	const agent = this.agents[a];
	const target = targets[a];
        for (let b = 0; b != 4; b++) {
	  if (a != b && target == moveTo[b]) {
	    const agent_b = this.agents[b];
            if (agent_b.action < 8) {
	      notViable[a] = true;
	    }
	  }
	}
      }
      for (let a = 0; a != 4; a++) {
	if (notViable[a]) {
	  const agent = this.agents[a];
	  agent.action = -1;
	  moveTo[a] = agent.at;
	}
      }
      // Process agent movements
      for (let role = 0; role != 4; role++) {
	const agent = this.agents[role];
        const pos = moveTo[role];
	agent.at = pos;
	if (agent.action < 8 && role >= 2) {
          // Dogs make embedded gold known to everyone
          this.hiddenGolds.forEach(g => {
            if (g == pos) {
	      this.hiddenGolds = this.hiddenGolds.filter(h => h != g);
	      this.knownGolds.push(g);
	      agent.barking = 1;
            }
          });
        }
      }
      // Process digging and plugging
      for (let a = 0; a != 2; a++) {
	const agent = this.agents[a];
	if (agent.action >= 8) {
	  if (agent.action < 16) {
            const dug = targets[a];
            this.holes.push(dug);
            this.hiddenGolds = this.hiddenGolds.filter(c => c != dug);
            this.knownGolds = this.knownGolds.filter(c => c != dug);
            this.dug.push(dug);
            if (dug.gold != 0 && !dug.alreadyDug) {
              this.goldRemaining -= dug.gold;
	      const opp = (a+1)%2;
              if (targets[opp] == dug) {
		this.golds[0] += dug.gold/2;
		this.golds[1] += dug.gold/2;
		this.agents[0].obtained = dug.gold/2;
		this.agents[1].obtained = dug.gold/2;
		break;
              } else {
		this.golds[a] += dug.gold;
		this.agents[a].obtained = dug.gold;
	      }
	      dug.alreadyDug = true;
            }
          } else {
	    // Process plugging
            const plugged = targets[a];
            this.holes.splice(this.holes.indexOf(plugged), 1);
            this.plugged.push(plugged);
	  }
        }
      }
    }
  }
  redraw(init) {
    function encodeTime(t) {
      t /= 1000;
      const min = Math.floor(t/60);
      const sec = Math.floor(t%60);
      return min + ":" + (sec < 10 ? "0" : "") + sec;
    }
    if (init || substep == midStep) {
      // Remove manual play targets, if any
      removeAllChildren(arrowsLayer);
      removeAllChildren(holeLayer);
      // Draw or remove holes
      for (let x = 0; x != fieldSize; x++) {
        for (let y = 0; y != fieldSize; y++) {
          const cell = cells[x][y];
          if (this.holes.includes(cell)) {
            holeLayer.appendChild(cell.holeImage);
          } else if (cell.holeImage.parentNode == holeLayer) {
            holeLayer.removeChild(cell.holeImage);
          }
        }
      }
      for (let x = 0; x != fieldSize; x++) {
        for (let y = 0; y != fieldSize; y++) {
          cells[x][y].setNeighbors();
        }
      }
      // Draw or remove golds
      removeAllChildren(hiddenGoldLayer);
      this.hiddenGolds.forEach(g => {
	makeGoldImage(g, false);
        hiddenGoldLayer.appendChild(g.goldImage);
      });
      removeAllChildren(knownGoldLayer);
      this.knownGolds.forEach(g => {
	makeGoldImage(g, true);
        knownGoldLayer.appendChild(g.goldImage);
      });
      // Update scores and think time left
      for (let t = 0; t != 2; t++) {
        scores[t].innerHTML = this.golds[t];
      }
      remainingLabel.innerHTML = this.goldRemaining;
      for (let a = 0; a != 4; a++) {
	const label = timeLeftLabels[a];
	const left = this.timeLeft[a];
	label.innerHTML = encodeTime(left);
	label.style.color = left == 0 ? expiredColor : speedColor;
      }
      currentStepLabel.style.color =
        this.stepNumber == maxSteps || this.goldRemaining == 0 ?
        endGameClockColor :
        this.stepNumber == stepRecords.length - 1 ?
        lastRecordClockColor :
        clockColor;
      currentStepLabel.innerHTML = currentStep + "/" + maxSteps;
    }
    // Draw agents
    this.agents.forEach(a => {
      if (a.attributes.seq < 2) { // Samurai
	if (init) {
          if (a.action >= 8) {
	    a.digging = 2;
          }
        } else if (substep == 0) {
          if (a.planned >= 8) {
	    a.digging = 1;
          }
        } else if (substep == midStep) {
	  a.energy = a.planned < 0 ? 1 : 0;
          if (a.action >= 8) {
	    a.digging = 2;
            if (a.action < 16) {
              new Audio(scoopSoundFile).play();
              if (a.obtained != 0) new Audio(goldSoundFile).play();
            } else {
              new Audio(plugSoundFile).play();
	    }
          }
        }
      } else if (a.barking && substep == midStep) {
	new Audio(barkSoundFile).play();
      }
      a.reposition(init);
    });
    let agts = this.agents.concat();
    agts.sort((a1, a2) => {
      const distDiff = (a1.at.x+a1.at.y) - (a2.at.x+a2.at.y);
      if (distDiff != 0 || a1.action == -1 || a2.action == -1) return distDiff;
      return [-1,0,1,2,1,0,-1,-2][a1.action%8] -
	[-1,0,1,2,1,0,-1,-2][a2.action%8];
    });
    agts.forEach(a => agentLayer.appendChild(a.attributes.image));
    if (manualAgent >= 0 && (init || substep == midStep)) {
      // Draw arrows and show diamonds on candidate positions
      class MouseEnterHandler {
        constructor(diamond) { this.diamond = diamond; }
        handleEvent(ev) {
          this.diamond.style.stroke = "rgb(200,0,0)";
        }
      }
      class MouseLeaveHandler {
        constructor(diamond) { this.diamond = diamond; }
        handleEvent(ev) {
          this.diamond.style.stroke = "none";
        }
      }
      class MouseClickHandler {
        constructor(diamond, direction) {
          this.diamond = diamond;
          this.direction = direction;
        }
        handleEvent(ev) {
          actionCommand(ev, this.direction);
        }
      }
      const apos = this.agents[manualAgent].at;
      // Show arrow images
      const dirstep = this.agents[manualAgent].planned == -1 ? 1 : 2;
      for (let dir = 0; dir != 8; dir += dirstep) {
        const pos = apos.neighbors[dir];
        if (pos != null && this.agents.every(a => a.at != pos)) {
          const arrow = createSVG('image');
          arrow.setAttribute('href', arrowImages[dir]);
	  const size = dir%2 == 0 ? 0.4 : 0.6;
	  const offset = dir%2 == 0 ? 0.2 : 0.3;
          arrow.setAttribute('width', size*cellWidth);
          arrow.setAttribute('height', size*cellHeight);
          arrow.setAttribute('x', pos.cx-offset*cellWidth);
          arrow.setAttribute('y', pos.cy-offset*cellHeight);
          arrow.setAttribute('opacity', 0.6);
          arrowsLayer.appendChild(arrow);
        }
      }
      // Make mouse sensitive ellipses for move instruction
      function makeMoveDiamond(pos, dir) {
	const moveCircle = createSVG('ellipse');
	moveCircle.setAttribute('cx', pos.cx);
	moveCircle.setAttribute('cy', pos.cy);
	moveCircle.setAttribute('rx', 0.3*cellWidth);
	moveCircle.setAttribute('ry', 0.3*cellHeight);
	moveCircle.style.fill = 'rgba(1,1,1,0)';
	moveCircle.style.strokeWidth = Math.max(2, cellWidth/20)+"px";
	arrowsLayer.appendChild(moveCircle);
        const enterHandler = new MouseEnterHandler(moveCircle);
        moveCircle.addEventListener('mouseenter', enterHandler);
        const leaveHandler = new MouseLeaveHandler(moveCircle);
        moveCircle.addEventListener('mouseleave', leaveHandler);
        const clickHandler = new MouseClickHandler(moveCircle, dir);
        moveCircle.addEventListener('click', clickHandler);
      }
      for (let dir = 0; dir != 8; dir += dirstep) {
        const pos = apos.neighbors[dir];
        if (pos != null && this.agents.every(a => a.at != pos)) {
          makeMoveDiamond(pos, dir);
	}
      }
      makeMoveDiamond(apos, -1);
    }
  }
}

let stepRecords = [];

function speedChange(delta) {
  playTempo = Math.min(240, Math.max(24, playTempo+delta));
  stepsPerMin.innerHTML = playTempo;
}

function setPlaySpeed() {
  stepInterval = 60*1000/playTempo;
  numSubsteps = Math.floor(frameRate*stepInterval/1000);
  substepInterval = stepInterval/numSubsteps;
  midStep = Math.floor((numSubsteps+1)/2);
  bgm.setTempo(Math.sqrt(playTempo/60));
}

function speedWheel(ev) {
  ev.preventDefault();
  let delta = ev.deltaY > 0 ? -4 : 4;
  if (ev.ctrlKey) delta *= 10;
  speedChange(delta);
}

function speedControl(ev) {
  let delta = ev.shiftKey ? 4 : -4;;
  if (ev.ctrlKey) delta *= 10;
  speedChange(delta);
}

let hideWhileEdit;
let showWhileEdit;

const topBarButtons = [
  "rewind", "stepBackward", "playStop", "stepForward", "fastForward",
  "speedometer", "clock", "goldImage", "manual", "tweak", "edit", "help",
  "randomize", "clearLog", "load", "save", "remove", "import", "export",
  "resize", "exitEdit"
];
const infoLabels = ["stepsPerMin", "currentStepLabel", "remainingLabel"];

function prepareFenceLogos() {
  leftLogos = [...sponsorLogos];
  rightLogos = [];
  let logoWidthSum = 0;
  sponsorLogos.forEach(logo => logoWidthSum += logoSizes[logo.category]);
  rightLogoWidth = 0;
  while (rightLogoWidth < logoWidthSum/2) {
    const k = Math.floor(random.gen()*leftLogos.length);
    const logo = leftLogos[k];
    const size = logoSizes[logo.category];
    if (rightLogoWidth+size/2 > logoWidthSum/2) break;
    rightLogoWidth += size;
    rightLogos.push(leftLogos[k]);
    leftLogos.splice(k, 1);
  }
  leftLogoWidth = logoWidthSum - rightLogoWidth;
}

function drawFence() {
  const fence = createSVG('g');
  function leftTransform(elem, x, y) {
    elem.setAttribute('transform',
                      "translate("+x+","+ (0.5*(fieldWidth/2-x) + y)+") " +
                      "skewY(-26.5651)");
  }
  function rightTransform(elem, x, y) {
    elem.setAttribute(
      'transform',
      "translate("+(fieldWidth/2+x)+","+ (0.5*x + y)+
        ") skewY(26.5651)");
  }
  const fenceHeight = 0.9*topMargin;
  const leftFence = createSVG('rect');
  leftFence.setAttribute('width', fieldSize*cellWidth/2-3);
  leftFence.setAttribute('height', fenceHeight);
  leftFence.style.fill = leftFenceColor;
  leftFence.style.stroke = "white";
  leftTransform(leftFence, 3, 0);
  fence.appendChild(leftFence);

  const logoWidthCoef = 0.9/Math.max(leftLogoWidth, rightLogoWidth);
  const leftGap =
        fieldWidth/2*(1-logoWidthCoef*leftLogoWidth)/(leftLogos.length+1);
  let pos = leftGap;
  leftLogos.forEach(logo => {
    const logoWidth = logoWidthCoef*logoSizes[logo.category]*fieldWidth/2;
    const image = createSVG('image');
    image.setAttribute('href', "../logos/"+logo.source);
    image.setAttribute('width', logoWidth);
    image.setAttribute('height', 0.9*fenceHeight);
    leftTransform(image, pos, 0.1*fenceHeight);
    pos += logoWidth + leftGap;
    fence.appendChild(image);
  });

  const rightFence = createSVG('rect');
  rightFence.setAttribute('width', fieldSize*cellWidth/2-3);
  rightFence.setAttribute('height', fenceHeight);
  rightFence.style.fill = rightFenceColor;
  rightFence.style.stroke = "white";
  rightTransform(rightFence, 0, 0);
  fence.appendChild(rightFence);

  const rightGap =
        fieldWidth/2*(1-logoWidthCoef*rightLogoWidth)/(rightLogos.length+1);
  pos = rightGap;
  rightLogos.forEach(logo => {
    const logoWidth = logoWidthCoef*logoSizes[logo.category]*fieldWidth/2;
    const image = createSVG('image');
    image.setAttribute('href', "../logos/"+logo.source);
    image.setAttribute('width', logoWidth);
    image.setAttribute('height', 0.9*fenceHeight);
    rightTransform(image, pos, 0.1*fenceHeight);
    pos += logoWidth + rightGap;
    fence.appendChild(image);
  });
  return fence;
}

function resizeField() {
  // Remove everything in the field
  removeAllChildren(field);
  arrowsLayer = createSVG('g');
  diamondLayer = createSVG('g');
  for (let x = 0; x != fieldSize; x++) {
    for (let y = 0; y != fieldSize; y++) {
      cells[x][y].resize();
    }
  }
  field.setAttribute('width', fieldWidth+"px");
  field.setAttribute('height', fieldHeight+"px");
  const buttonSize = Math.max(8, fieldWidth/30) + "px";
  topBarButtons.forEach(id => {
    const button = document.getElementById(id);
    button.style.height = buttonSize;
  });
  const fontSize = Math.max(14, fieldWidth/25) + "px";
  const scoreFontSize = Math.max(14, fieldWidth/15) + "px";
  const timeFontSize = Math.max(12, fieldWidth/35) + "px";
  infoLabels.forEach(
    name => document.getElementById(name).style.fontSize = fontSize);
  background = createSVG('g');
  backgroundDirt = createSVG('rect');
  backgroundDirt.setAttribute('x', 0);
  backgroundDirt.setAttribute('y', 0);
  backgroundDirt.setAttribute('width', fieldWidth);
  backgroundDirt.setAttribute('height', fieldHeight);
  backgroundDirt.setAttribute(
    'style', "fill:"+
      (editMode ? editingBackgroundColor : backgroundColor));
  background.appendChild(backgroundDirt);
  const lawn = createSVG('polygon');
  lawn.setAttribute(
    'points',
    fieldWidth/2 + ',' + topMargin + ' ' +
      fieldWidth + ',' + (fieldSize*halfHeight + topMargin) + ' ' +
      fieldWidth/2 + ',' + (fieldSize*cellHeight+topMargin) + ' ' +
      0 + ',' + (fieldSize*halfHeight+topMargin));
  lawn.style.fill = lawnColor;
  background.appendChild(lawn);
  background.appendChild(drawFence());
  // Lawn grid
  const gridColor = backgroundColor;
  const gridStrokeWidth = Math.max(1, cellHeight/30);
  const grid = createSVG('g');
  for (let k = 0; k != fieldSize+1; k++) {
    let downLine = createSVG('line');
    downLine.setAttribute('x1', k*halfWidth);
    downLine.setAttribute('x2', (k+fieldSize)*halfWidth);
    downLine.setAttribute('y1', (fieldSize-k)*halfHeight+topMargin);
    downLine.setAttribute('y2', (2*fieldSize-k)*halfHeight+topMargin);
    downLine.setAttribute('style',
			  "stroke-width:"+gridStrokeWidth+";stroke:"+gridColor);
    grid.appendChild(downLine);
    let upLine = createSVG('line');
    upLine.setAttribute('x1', k*halfWidth);
    upLine.setAttribute('x2', (k+fieldSize)*halfWidth);
    upLine.setAttribute('y1', (fieldSize+k)*halfHeight+topMargin);
    upLine.setAttribute('y2', k*halfHeight+topMargin);
    upLine.setAttribute('style',
			"stroke-width:"+gridStrokeWidth+";stroke:"+gridColor);
    grid.appendChild(upLine);
  }
  background.appendChild(grid);
  field.insertBefore(background, field.firstChild);
  holeLayer = createSVG('g');
  field.appendChild(holeLayer);
  // Redraw golds
  hiddenGoldLayer = createSVG('g');
  hiddenGoldLayer.style.display = editMode ? "block" : "none";
  field.appendChild(hiddenGoldLayer);
  knownGoldLayer = createSVG('g');
  field.appendChild(knownGoldLayer);
  agentLayer = createSVG('g');
  field.appendChild(agentLayer);
  // Resize agent icons and score
  for (let t = 0; t != 2; t++) {
    const samurai = document.getElementById("samuraiFigure" + t);
    samurai.height = 0.2*fieldHeight;
    samurai.style.position = "relative";
    const dog = document.getElementById("dogFigure" + t);
    dog.height = 0.18*fieldHeight;
    dog.style.position = "relative";
    const score = document.getElementById("scoreLabel" + t);
    score.style.fontSize = scoreFontSize;
    score.style.fontFamily = 'roman';
    score.style.fontWeight = 'bold';
    score.style.textShadow = "1px 1px black"
    score.style.color = scoreColor;
    scores[t] = score;
  }
  // Resize time left labels
  for (let a = 0; a != 4; a++) {
    const timeLeft = document.getElementById("timeLeft" + a);
    timeLeft.style.fontSize = timeFontSize;
    timeLeft.style.fontFamily = 'roman';
    timeLeft.style.fontWeight = 'bold';
    timeLeft.style.textShadow = "1px 1px black"
    timeLeftLabels[a] = timeLeft;
  }
  document.getElementById("topBar").style.top = "0px";
  document.getElementById("bottomBar").style.top = 0.73*fieldHeight + "px";
  // Arrow and diamond layers
  field.appendChild(arrowsLayer);
  diamondLayer.style.display = editMode ? "block" : "none";
  field.appendChild(diamondLayer);
  // Resize sponsor logos
  platinumLogoImages.forEach(resizeLogo);
}

function redrawField(config) {
  stopAutoPlay();
  fieldSize = config.size;
  maxSteps = config.steps;
  setSizes();
  // Prepare cells
  cells = [];
  for (let x = 0; x != fieldSize; x++) {
    cells[x] = [];
    for (let y = 0; y != fieldSize; y++) {
      cells[x][y] = new Cell(x, y);
    }
  }
  // Configure buttons
  topBarButtons.forEach(id => {
    const button = document.getElementById(id);
    window[id+"Button"] = button;
  })
  rewindButton.onclick = rewind;
  stepBackwardButton.onclick = stepBackward;
  playStopButton.onclick = startStopPlay;
  stepForwardButton.onclick = _ => stepForward(false);
  fastForwardButton.onclick = fastForward;
  goldImageButton.onmousedown = showHiddenGold;
  goldImageButton.onmouseout = hideHiddenGold;
  goldImageButton.onmouseup = hideHiddenGold;
  tweakButton.onclick = tweakSettings;
  manualButton.onclick = toggleManualPlay;
  randomizeButton.onclick = randomize;
  clearLogButton.onclick = clearPlayLog;

  editButton.onclick = enterEditMode;
  exitEditButton.onclick = exitEditMode;
  loadButton.onclick = loadGameLog;
  saveButton.onclick = saveGameLog;
  importButton.onclick = importGameLog;
  exportButton.onclick = exportGameLog;
  removeButton.onclick = removeGameLog;
  resizeButton.onclick = resize;
  clockButton.onclick = setStep;
  clockButton.onwheel = setStep;
  helpButton.onclick = openHelp;

  hideWhileEdit = [
    rewindButton, stepBackwardButton, playStopButton,
    stepForwardButton, fastForwardButton, speedometerButton,
    editButton, goldImageButton,
    manualButton, stepsPerMin
  ];
  showWhileEdit = [
    randomizeButton, clearLogButton,
    loadButton, saveButton, removeButton, exportButton,
    resizeButton, exitEditButton
  ];
  if (editMode) {
    showWhileEdit.forEach(b => b.style.display = 'inline');
    hideWhileEdit.forEach(b => b.style.display = 'none');
  } else {
    showWhileEdit.forEach(b => b.style.display = 'none');
    hideWhileEdit.forEach(b => b.style.display = 'inline');
  } 
  // Configure labels
  infoLabels.forEach(
    name => {
      const label = document.getElementById(name);
      window[name] = label;
      label.style.fontFamily = "roman";
      label.style.fontWeight = "bold";
      label.style.textShadow = "1px 1px black"
    });
  remainingLabel.style.color = scoreColor;
  stepsPerMin.style.color = speedColor;
  speedometer.onwheel = speedWheel;
  stepsPerMin.onwheel = speedWheel;
  speedometer.onclick = speedControl;
  stepsPerMin.onclick = speedControl;
  // The field background and the ground layer are painted on resize
  resizeField();
}

function showHiddenGold() {
  hiddenGoldLayer.style.display = 'block';
}

function hideHiddenGold() {
  hiddenGoldLayer.style.display = 'none';
}

class Random {
  constructor() {
    // this.x = 123456789;
    this.x = Date.now();
    this.y = 362436069;
    this.z = 521288629;
    this.w = 886751239;
  }
  gen() {
    let t = this.x ^ (this.x << 11);
    this.x = this.y; this.y = this.z; this.z = this.w;
    let v = this.w = (this.w ^ (this.w >>> 19)) ^ (t ^ (t >>> 8)); 
    return Math.abs(v)%1000000/1000000;
  }
};

let random;

function randomize(ev) {
  initialize(randomConfig(false));
}

function clearPlayLog() {
  currentStep = 0;
  stepRecords = [];
}

function rewind() {
  if (currentStep != 0) {
    currentStep = 0;
    stepRecords[0].redraw(true);
  }
}

function fastForward() {
  if (currentStep != stepRecords.length - 1) {
    currentStep = stepRecords.length - 1;
    stepRecords[currentStep].redraw(true);
  }
}

function setSizes() {
  fieldWidth = window.innerWidth;
  cellWidth = fieldWidth/fieldSize;
  cellHeight = cellWidth/2;
  halfWidth = cellWidth/2;
  halfHeight = cellHeight/2;
  topMargin = topMarginRatio * fieldWidth;
  fieldHeight = fieldWidth/2 + topMargin;
}

function resizeLogo(logo) {
  const logoAreaSize = 0.006*fieldWidth*fieldWidth;
  const area = logo.naturalWidth*logo.naturalHeight;
  const mag = Math.sqrt(logoAreaSize/area);
  logo.width = mag*logo.naturalWidth;
}

const platinumLogoImages = [];

function displayLogo() {
  // Sponsor logos at the bottom of the top bar
  // Shuffle the order of logos first
  const logoAreas = ["logoAreaLeft", "logoAreaRight"].
    map(id => document.getElementById(id));
  for (let k = platinumLogos.length; k != 1; k--) {
    const r = Math.floor(k*Math.random());
    const tmp = platinumLogos[k-1];
    platinumLogos[k-1] = platinumLogos[r];
    platinumLogos[r] = tmp;
  }
  for (let s = 0; s != platinumLogos.length; s++) {
    const logo = document.createElement('img');
    platinumLogoImages.push(logo);
    logo.src = "../logos/" + platinumLogos[s];
    logo.onload = () => {
      logo.style.background = "white";
      logo.style.margin = "10px";
      logo.style.display = "block";
      if (s%2 != 0) logo.align = "right";
      resizeLogo(logo);
      logoAreas[s%2].appendChild(logo);
    }
  }
}

function start() {
  random = new Random();
  initialize(randomConfig(true));
  displayLogo();
}

function initialize(config) {
  // Prepare the field
  field = document.getElementById("battle field");
  // Prepare sponsor logos on fences
  prepareFenceLogos();
  // Initialize a game
  redrawField(config);
  thinkTime = config.thinkTime;
  stepRecords = [new GameState(null, null, config)];
  currentStep = 0;
  stepRecords[0].redraw(true);
  window.onresize = () => {
    setSizes();
    resizeField();
    stepRecords[currentStep].redraw(true);
  }    
  window.onkeydown = keyDown;
  // Make the field mouse wheel insensitive
  field.onwheel = ev => ev.preventDefault();
}

function substepForward() {
  stepRecords[currentStep].redraw(false);
  substep += 1;
  if (substep == numSubsteps) {
    substep = 0;
    const finished =
          stepRecords[currentStep].goldRemaining == 0 ||
          stepRecords[currentStep].stepNumber == maxSteps;
    if (finished) new Audio(gongSoundFile).play();
    if (finished || stepRecords[currentStep].stepNumber >= playUntil) {
      stopAutoPlay();
      return;
    } else {
      new Audio(tickSoundFile).play();
      if (stepRecords.length == currentStep + 1) {
        stepRecords[currentStep+1] = new GameState(stepRecords[currentStep]);
      }
      currentStep += 1;
    }
    setPlaySpeed();
  }
  playTimer = setTimeout(substepForward, substepInterval);
}

let playTimer = undefined;

function stepBackward() {
  if (currentStep == 0) return;
  playUntil = 0;
  currentStep -= 1;
  stepRecords[currentStep].redraw(true);
}

function stepForward(repeat, commandPlay) {
  removeAllChildren(arrowsLayer);
  if (stepRecords[currentStep].goldRemaining == 0 ||
      stepRecords[currentStep].stepNumber == maxSteps) {
    return;
  }
  if (playTimer == undefined) {
    if (commandPlay != undefined ||
        stepRecords.length <= currentStep+1) {
      stepRecords = stepRecords.slice(0, currentStep+1);
      stepRecords[currentStep+1] =
        new GameState(stepRecords[currentStep], commandPlay);
    }
    currentStep += 1;
    substep = 0;
    playUntil = repeat ? maxSteps : stepRecords[currentStep].stepNumber;
    setPlaySpeed();
    playTimer = setTimeout(substepForward, substepInterval);
  }
}

function actionCommand(ev, plan) {
  const target =
        stepRecords[currentStep].agents[manualAgent].at.neighbors[plan];
  if (ev.shiftKey) {
    plan += stepRecords[currentStep].holes.includes(target) ? 16 : 8;
  }
  if (plan < 8 && stepRecords[currentStep].holes.includes(target)) {
    new Audio(beepSoundFile).play();
  } else {
    stepForward(false, plan);
  }
}

function keyDown(ev) {
  if (manualAgent >= 0) {
    let plan = {
      "KeyB": 0,
      "KeyH": 1, "ArrowLeft": 1,
      "KeyY": 2,
      "KeyK": 3, "ArrowUp": 3,
      "KeyU": 4,
      "KeyL": 5, "ArrowRight": 5,
      "KeyN": 6,
      "KeyJ": 7, "ArrowDown": 7,
      "Space": -1, "Period": -1
    }[ev.code];
    if (plan !== undefined) {
      if (plan >= 0) {
	if (stepRecords[currentStep].agents[manualAgent].planned != -1 &&
	    plan%2 != 0) {
	  plan = (plan+7)%8;
	}
	const target = stepRecords[currentStep].agents[manualAgent].at.
	      neighbors[plan];
	if (target == null ||
            stepRecords[currentStep].agents.some(a => a.at == target)) {
          return;
	}
      }
      actionCommand(ev, plan);
    }
  } else if (ev.code == "Space") {
    stepForward(false);
  }
}

function startStopPlay() {
  if (playTimer != undefined) {
    playUntil = 0;
  } else if (stepRecords[currentStep].goldRemaining != 0 &&
             currentStep != maxSteps) {
    if (currentStep == 0) {
      bgm.start();
    } else {
      bgm.resume();
    }
    playUntil = maxSteps;
    playStopButton.src = "../icons/stop.png";
    stepForward(true);
  }
}

function stopAutoPlay() {
  bgm.stop();
  if (playTimer != undefined) {
    clearInterval(playTimer);
    playStopButton.src = '../icons/play.png';
    playTimer = undefined;
  }
}

///////////////////////////
// Configuration Editor
///////////////////////////

let editMode = false;
let diamondListeners;

function purgePlays() {
  stepRecords.splice(1);
  currentStep = 0;
}

function enterEditMode() {
  editMode = true;
  setManualPlay(-1);
  hideWhileEdit.forEach(b => b.style.display = "none");
  showWhileEdit.forEach(b => b.style.display = "inline");
  backgroundDirt.style.fill = editingBackgroundColor;
  stepRecords[0].redraw(true);
  diamondLayer.style.display = 'block';
  timeLeftLabels.forEach(l => {
    l.onclick = l.onwheel = adjustThinkTime;
  });
  showHiddenGold();
}

function exitEditMode() {
  hideWhileEdit.forEach(b => b.style.display = "inline");
  showWhileEdit.forEach(b => b.style.display = "none");
  backgroundDirt.setAttribute('style', "fill:"+backgroundColor);
  stepRecords[currentStep].redraw(true);
  hideHiddenGold();
  diamondLayer.style.display = 'none';
  timeLeftLabels.forEach(l => {
    l.onclick = l.onwheel = null;
  });
  editMode = false;
}

class DiamondEnterListener {
  constructor(image) {
    this.image = image;
  }
  handleEvent(ev) {
    this.image.style.stroke = 'rgb(200,200,200)';
  }
}

class DiamondLeaveListener {
  constructor(image) {
    this.image = image;
  }
  handleEvent(ev) {
    this.image.style.stroke = 'none';
  }
}

class DiamondDownListener {
  constructor(cell) {
    this.cell = cell;
  }
  handleEvent(ev) {
    const rec = stepRecords[currentStep];
    let agent = null;
    rec.agents.forEach(a => { if (a.at == this.cell) agent = a; });
    if (agent != null) {
      const moveHandler =
            new AgentMove(agent, ev.pageX, ev.pageY);
      if (ev.shiftKey) {
        // Rotate the agent if a shift key is pressed
        const role = agent.attributes.seq;
        agent.direction =
	  (agent.direction + (ev.ctrlKey ? -1 : 1) + 8) % 8;
	purgePlays();
      }
      field.addEventListener('mousemove', moveHandler);
      field.addEventListener(
        'mouseup', new EndAgentMove(agent, moveHandler));
    } else {
      const cell = this.cell;
      if (rec.holes.includes(cell)) {
        rec.holes.splice(rec.holes.indexOf(cell), 1);
        holeLayer.removeChild(cell.holeImage);
      } else if (cell.gold != 0 && ev.ctrlKey) {
	const isKnown = rec.knownGolds.includes(cell);
	const currentLayer = isKnown ? knownGoldLayer : hiddenGoldLayer;
	const currentList = isKnown ? rec.knownGolds : rec.hiddenGolds;
	const newLayer = !isKnown ? knownGoldLayer : hiddenGoldLayer;
	const newList = !isKnown ? rec.knownGolds : rec.hiddenGolds;
	currentLayer.removeChild(cell.goldImage);
	currentList.splice(currentList.indexOf(cell), 1);
	makeGoldImage(cell, !isKnown);
	newLayer.appendChild(cell.goldImage);
	newList.push(cell);
      } else if (cell.gold != 0 || ev.shiftKey) {
	const isKnown = rec.knownGolds.includes(cell);
	const goldLayer = isKnown ? knownGoldLayer : hiddenGoldLayer;
	const goldList = isKnown ? rec.knownGolds : rec.hiddenGolds;
        let delta = ev.shiftKey ? 2 : -2;
        delta = Math.max(-cell.gold, delta);
	if (cell.gold != 0) {
	  goldLayer.removeChild(cell.goldImage);
	  goldList.splice(goldList.indexOf(cell), 1);
	}
        cell.gold += delta;
        rec.goldRemaining += delta;
        remainingLabel.innerHTML = rec.goldRemaining;
	if (cell.gold != 0) {
          makeGoldImage(cell, isKnown);
	  goldList.push(cell);
	  goldLayer.appendChild(cell.goldImage);
        }
      } else {
        rec.holes.push(cell);
        holeLayer.appendChild(cell.holeImage);
      }
      purgePlays();
    }
  }
}

class AgentMove {
  constructor(agent, startX, startY) {
    this.agent = agent;
    this.nowAt = agent.at;
    this.startX = this.prevX = startX;
    this.startY = this.prevY = startY;
  }
  handleEvent(ev) {
    const agent = this.agent;
    // Move the agent image
    const deltaX = ev.pageX - this.prevX;
    const deltaY = ev.pageY - this.prevY;
    const img = agent.attributes.image;
    img.setAttribute('x', Number(img.getAttribute('x')) + deltaX);
    img.setAttribute('y', Number(img.getAttribute('y')) + deltaY);
    this.prevX = ev.pageX;
    this.prevY = ev.pageY;
    // Move the target cell
    const origat = this.agent.at;
    const cellXplusY =
          origat.x + origat.y + 2*(ev.pageY-this.startY)/cellHeight;
    const cellXminusY =
          origat.x - origat.y + 2*(ev.pageX-this.startX)/cellWidth;
    const cellX = Math.round((cellXplusY + cellXminusY)/2);
    const cellY = Math.round((cellXplusY - cellXminusY)/2);
    if ((agent.x != cellX || agent.y != cellY) &&
        0 <= cellX && cellX < fieldSize &&
        0 <= cellY && cellY < fieldSize) {
      const newCell = cells[cellX][cellY];
      const rec = stepRecords[currentStep];
      if (!rec.holes.includes(newCell) &&
	  !rec.knownGolds.includes(newCell) &&
	  !rec.hiddenGolds.includes(newCell) &&
          rec.agents.every(a => a == agent || a.at != newCell)) {
        this.nowAt = newCell;
      }
    }
  }
}

class EndAgentMove {
  constructor(agent, moveHandler) {
    this.agent = agent;
    this.moveHandler = moveHandler;
  }
  handleEvent(ev) {
    field.removeEventListener('mouseup', this);
    field.removeEventListener('mousemove', this.moveHandler);
    const agent = this.moveHandler.agent;
    agent.at = this.moveHandler.nowAt;
    purgePlays();
    agent.reposition(true);
  }
}

function setStep(ev) {
  let delta =
      ev.type == "click" ?
      (ev.shiftKey ? 1 : -1) :
      (ev.deltaY > 0 ? -1 : 1);
  if (ev.ctrlKey) delta *= 10;
  if (editMode) {
    maxSteps = Math.max(10, maxSteps+delta);
  } else {
    const newStep = currentStep + delta;
    if (0 <= newStep && newStep < stepRecords.length) {
      currentStep = newStep;
    }
  }
  purgePlays();
  stepRecords[0].redraw(true);
}

const LocalStorageKey = "SamurAI Dig Here 2020 Game Logs";
const GameLogFileTypeString = "SamurAI Dig Here 2020 Game Log";
let previousGameLogName = null;

function menuChoice(message, items, store, makeHandler) {
  const menuDiv = document.createElement('div');
  menuDiv.innerHTML = message + "<br>";
  menuDiv.style.display = "block";
  menuDiv.style.position = "absolute";
  menuDiv.style.fontSize = cellWidth/5+"px";
  menuDiv.className = "menuPopup";
  const itemsTable = document.createElement('table');
  itemsTable.className = "menuTable";
  items.forEach(i => {
    const row = document.createElement('tr');
    const item = document.createElement('td');
    item.className = "menuItem";
    item.innerHTML = i;
    item.addEventListener('click', makeHandler(i, store, menuDiv));
    row.appendChild(item);
    itemsTable.appendChild(row);
  });
  const cancelRow = document.createElement('tr');
  const cancel = document.createElement('td');
  cancel.className = "menuItem cancelItem";
  cancel.innerHTML += "cancel";
  cancel.onclick = (ev) =>
    document.getElementById("topBar").removeChild(menuDiv);
  cancelRow.appendChild(cancel);
  itemsTable.appendChild(cancelRow);
  menuDiv.appendChild(itemsTable);
  document.getElementById("topBar").appendChild(menuDiv);
}

function applyGameLog(log) {
  initialize(log.field);
  for (let key in log.params) {
    if (log.params.hasOwnProperty(key)) {
      params[key] = log.params[key];
    }
  }
  let step = 0;
  log.plays.forEach(p => {
    const state = new GameState(stepRecords[step], p.plans);
    if (p.step != step) {
      showAlertBox(
	"Step number " + p.step + " is recorded, that should be " + step);
      throw new Error("Inconsistency in Step Number Found");
    }
    for (let a = 0; a != 4; a++) {
      const pp = p.agents[a];
      const sp = state.agents[a].at;
      if (pp.x != sp.x || pp.y != sp.y) {
	showAlertBox(
	  "Position of agent " + a + " does not match at step "
	    + (step+1) + ":\n" +
	    "  Recorded: (" + pp.x + "," + pp.y + ")\n" +
	    "  Actual: (" + sp.x + "," + sp.y + ")");
	throw new Error("Inconsistency in Agent Position Found");
      }
      const pa = p.actions[a];
      const sa = state.agents[a].action;
      if (pa != sa) {
	showAlertBox(
	  "Action of agent " + a + " does not match at step "
	    + (step+1) + ":\n" +
	    "  Recorded: " + pa + "\n" +
	    "  Actual: " + sa);
	throw new Error("Inconsistency in Agent Action Found");
      }
    }
    if (p.scores[0] != state.golds[0] || p.scores[1] != state.golds[1]) {
      showAlertBox(
	"Scores do not match at step " +
	  + (step+1) + ":\n" +
	  "  Recorded: " + p.scores[0] + ":" + p.scores[1] + "\n" +
	  "  Played State: " + state.golds[0] + ":" + state.golds[1]);
      throw new Error("Inconsistency in Scores Found");
    }
    state.timeLeft = p.timeLeft.slice();
    stepRecords[++step] = state;
  });
}

class GameLogLoader {
  constructor(item, store, menu) {
    this.store = store; this.item = item; this.menu = menu;
  }
  handleEvent(ev) {
    const log = this.store[this.item];
    if (log.filetype != GameLogFileTypeString) {
      showAlertBox("Data stored is not a game log of SamurAI Dig Here 2020");
      return;
    }
    applyGameLog(log);
    document.getElementById("topBar").removeChild(this.menu);
  }
}

function loadGameLog(ev) {
  if (localStorage == undefined) {
    showAlertBox("Local storage not available in this browser");
    return;
  }
  const logsInJSON = localStorage.getItem(LocalStorageKey);
  if (logsInJSON == undefined || logsInJSON == "{}") {
    showAlertBox("No game logs are stored locally");
    return;
  }
  const store = JSON.parse(logsInJSON);
  menuChoice("Which game log to load?", Object.keys(store),
             store, (i, s, menu) => new GameLogLoader(i, s, menu));
}

class GameLogRemover {
  constructor(item, store, menu) {
    this.store = store; this.item = item; this.menu = menu;
  }
  handleEvent(ev) {
    this.store[this.item] = undefined;
    localStorage.setItem(LocalStorageKey, JSON.stringify(this.store));
    document.getElementById("topBar").removeChild(this.menu);
  }
}

function removeGameLog(ev) {
  if (localStorage == undefined) {
    showAlertBox("Local storage not available on this browser");
    return;
  }
  let logsInJSON = localStorage.getItem(LocalStorageKey);
  if (logsInJSON == undefined || logsInJSON == "{}") {
    showAlertBox("No game logs are stored locally");
    return;
  }
  const store = JSON.parse(logsInJSON);
  menuChoice("Name of game log to remove?", Object.keys(store),
             store, (i, s, menu) => new GameLogRemover(i, s, menu));
}

function initialConfig() {
  const rec = stepRecords[0];
  return {
    size: fieldSize,
    steps: maxSteps,
    agents: rec.agents.map(a => {
      return {x: a.at.x, y: a.at.y, direction: a.direction};
    }),
    holes: rec.holes.map(h => {
      return {x: h.x, y:h.y};
    }),
    known: rec.knownGolds.map(g => {
      return {x: g.x, y: g.y, amount: g.gold};
    }),
    hidden: rec.hiddenGolds.map(g => {
      return {x: g.x, y: g.y, amount: g.gold};
    }),
    thinkTime: thinkTime
  };
}

function playLog() {
  const log = [];
  for (let s = 1; s != stepRecords.length; s++) {
    const rec = stepRecords[s];
    const plans = [];
    const actions = [];
    const agents = [];
    rec.agents.forEach(a => {
      plans.push(a.planned);
      actions.push(a.action);
      agents.push({x: a.at.x, y: a.at.y});
    });
    log.push({
      step: s-1,
      plans: plans, actions: actions, agents: agents, scores: rec.golds
    });
  }
  return log;
}

function showAlertBox(message) {
  const fontSize = Math.max(14, fieldWidth/40) + "px";
  const box = document.getElementById("promptBox");  
  box.style.fontSize = fontSize;
  box.childNodes.forEach(node => {
    if (node.style) {
      node.style.fontSize = fontSize;
      node.style.fontFamily = "roman";
      node.style.display = "none";
    }
  });
  const msg = document.getElementById("promptMessage");
  msg.innerHTML = message;
  msg.style.display = "inline";
  const button = document.getElementById("promptDoItButton");
  button.innerHTML = "OK";
  button.style.display = "inline";
  button.onclick = ev => box.style.display = "none";
  box.style.display = "block";
}

function showPromptBox(message, buttonLabel, initialValue, func) {
  const fontSize = Math.max(14, fieldWidth/40) + "px";
  const box = document.getElementById("promptBox");
  box.style.fontSize = fontSize;
  box.childNodes.forEach(node => {
    if (node.style) {
      node.style.fontSize = fontSize;
      node.style.fontFamily = "roman";
      node.style.display = "inline";
    }
  });
  document.getElementById("promptMessage").innerHTML = message;
  const input = document.getElementById("promptInput");
  input.value = initialValue;
  function finishInput(ev) {
    box.style.display = "none";
    func(input.value);
  }
  input.onchange = finishInput;
  const button = document.getElementById("promptDoItButton");
  button.innerHTML = buttonLabel;
  button.onclick = finishInput;
  document.getElementById("promptCancelButton").style.display = "inline";
  document.body.appendChild(box);
  box.style.display = "block";
  input.focus();
}

function saveGameLog(ev) {
  if (localStorage == undefined) {
    showAlertBox("Local storage not available on this browser");
    return;
  }
  let logsInJSON = localStorage.getItem(LocalStorageKey);
  const stored =
        logsInJSON == undefined ? {} :
        JSON.parse(logsInJSON);
  showPromptBox(
    "Saved game name?",
    "Save",
    (previousGameLogName || ""),
    gameLogName => {
      stored[gameLogName] = {
	filetype: GameLogFileTypeString,
	name: gameLogName,
	field: initialConfig(),
	plays: playLog()
      }
      previousGameLogName = gameLogName;
      localStorage.setItem(LocalStorageKey, JSON.stringify(stored));
    }
  );
}

function importGameLog(ev) {
  document.getElementById("importForm").click();
}

function importFile(ev) {
  if (ev.target.files.length == 0) return;
  var file = ev.target.files[0];
  var reader = new FileReader();
  reader.onload = e => {
    const log = JSON.parse(e.target.result);
    if (log.filetype != GameLogFileTypeString) {
      showAlertBox("Data stored is not a game log of SamurAI Dig Here 2020");
      return;
    }
    applyGameLog(log);
  }
  reader.readAsText(file);
}

function exportGameLog(ev) {
  showPromptBox(
    "File name to export to?",
    "Export",
    "",
    doExportToFile);
}

const DigHereFileExt = ".dighere";

function doExportToFile(name) {
  const periodPos = name.lastIndexOf(".");
  let fileName = name;
  if (periodPos < 0) { 
    fileName = name + DigHereFileExt;
  } else if (name.substr(-DigHereFileExt.length) == DigHereFileExt) {
    name = name.substr(0, name.length-DigHereFileExt.length);
  } else {
    name = name.substr(0, periodPos);
  }
  var file = new Blob(
    [JSON.stringify({
      filetype: GameLogFileTypeString,
      name: name,
      field: initialConfig(),
      params: params,
      plays: playLog()
    })],
    {type: 'application/json'});
  if (window.navigator.msSaveOrOpenBlob) {// IE10+
    window.navigator.msSaveOrOpenBlob(file, fileName);
  } else { // Others
    const a = document.createElement("a");
    const url = URL.createObjectURL(file);
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(function() {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 0);
  }
}

function resize(ev) {
  const config = initialConfig();
  if (ev.shiftKey) {
    if (fieldSize == minFieldSize) return;
    config.size -= 1;
    config.holes = config.holes.filter(
      h => h.x != config.size && h.y != config.size);
    config.known = config.known.filter(
      g => g.x != config.size && g.y != config.size);
    config.hidden = config.hidden.filter(
      g => g.x != config.size && g.y != config.size);
    config.agents.forEach(a => {
      if (a.x == config.size) a.x -= 1;
      if (a.y == config.size) a.y -= 1;
      while (config.agents.some(a2 => a != a2 && a.x == a2.x && a.y == a2.y)) {
	if (a.x != 0) {
          a.x -= 1;
	} else {
          a.x = config.size - 1
          a.y = (a.y + 1) % config.size;
	}
      }
      config.known = config.known.filter(g => g.x != a.x || g.y != a.y);
      config.hidden = config.hidden.filter(g => g.x != a.x || g.y != a.y);
      config.holes = config.holes.filter(h => h.x != a.x || h.y != a.y);
    });
  } else {
    if (fieldSize == maxFieldSize) return;
    config.size += 1;
  }
  purgePlays();
  initialize(config);
}

function adjustThinkTime(ev) {
  let delta =
      ev.type == "click" ?
      (ev.shiftKey ? -1 : 1) :
      (ev.deltaY > 0 ? -1 : 1);
  if (ev.ctrlKey) delta *= 10;
  thinkTime = Math.max(thinkTime+1000*delta, 1000);
  const config = initialConfig();
  purgePlays();
  initialize(config);
}

function openHelp(ev) {
  const url =
        "../documents/" +
        ( navigator.language.startsWith("ja") ?
          "help-jp.html" : "help.html" );
  window.open(url, "_blank");
}

class BGM {
  constructor(src) {
    this.playing = false;
    this.playTempo = 1;
    this.setSource(src);
  }
  setSource(src) {
    if (src !== this.source) {
      this.source = src;
      if (this.audio && this.playing) this.audio.pause();
      if (src == "") {
	this.audio = null;
      } else {
	this.audio = new Audio("../sounds/" + this.source + ".m4a");
	this.audio.playbackRate = this.playTempo;
	if (this.playing) this.start();
      }
    }
  }
  start() {
    this.playing = true;
    if (this.audio) {
      this.audio.currentTime = 0;
      this.audio.loop = true;
      this.audio.play();
    }
  }
  stop() {
    this.playing = false;
    if (this.audio) this.audio.pause();
  }
  resume() {
    this.playing = true;
    if (this.audio) this.audio.play();
  }
  setTempo(tempo) {
    this.playTempo = tempo;
    if (this.audio) this.audio.playbackRate = tempo;
  }
}

const bgm = new BGM('jazzy');

function tweakSettings() {
  const fontSize = Math.max(14, fieldWidth/40) + "px";
  const box = document.getElementById("tweakBox");
  box.style.fontSize = fontSize;
  box.childNodes.forEach(node => {
    if (node.style) {
      node.style.fontSize = fontSize;
      node.style.fontFamily = "roman";
      node.style.display = "inline";
    }
    node.childNodes.forEach(grandChild => {
      if (grandChild.style) {
	grandChild.style.fontSize = fontSize;
	grandChild.style.fontFamily = "roman";
	grandChild.style.display = "inline";
      }
    });
  });
  document.getElementById("bgmChoice").value = bgm.source;
  ['Agents', 'Holes', 'Known', 'Hidden'].forEach(kind => {
    const name = "randomize" + kind;
    const icon = document.getElementById(name);
    icon.className = params[name] ? "toggledOn" : "toggledOff";
  });
  document.getElementById("holeProb").value = params.holeProb;
  document.getElementById("knownProb").value = params.knownProb;
  document.getElementById("knownMax").value = params.knownMax;
  document.getElementById("hiddenProb").value = params.hiddenProb;
  document.getElementById("hiddenMax").value = params.hiddenMax;
  box.style.height = 0.6 * fieldHeight + "px";
  box.style.display = "block";
}

function tweakDone() {
  const box = document.getElementById("tweakBox");
  const tune = document.getElementById("bgmChoice").value;
  bgm.setSource(tune);
  ['Agents', 'Holes', 'Hidden', 'Known'].forEach(kind => {
    const name = "randomize" + kind;
    const icon = document.getElementById(name);
    params[name] = (icon.className == "toggledOn");
  });
  params.holeProb = document.getElementById("holeProb").value;
  params.knownProb = document.getElementById("knownProb").value;
  params.knownMax = document.getElementById("knownMax").value;
  params.knownMax = params.knownMax < 0 ? 2 : 2*Math.floor(params.knownMax/2);
  document.getElementById("knownMax").value = params.knownMax;
  params.hiddenProb = document.getElementById("hiddenProb").value;
  params.hiddenMax = document.getElementById("hiddenMax").value;
  params.hiddenMax =
    params.hiddenMax < 0 ? 2 : 2*Math.floor(params.hiddenMax/2);
  document.getElementById("hiddenMax").value = params.hiddenMax;
  goldMax = Math.max(params.knownMax, params.hiddenMax);
  box.style.display = "none";
}

function tweakCancel() {
  document.getElementById("tweakBox").style.display = "none";
}

function toggleRandomize(icon) {
  icon.className =
    icon.className == "toggledOn" ? "toggledOff" : "toggledOn";
}
