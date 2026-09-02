import { randomUUID } from "crypto";

export default {
  name: "snake",
  category: "owner",
  command: ["snake"],
  settings: { owner: true },
  run: async ({ conn, m }) => {
    const html = String.raw`
<style>
*{
    box-sizing:border-box;
    -webkit-tap-highlight-color:transparent;
    user-select:none;
}

html,body{
    margin:0;
    padding:0;
    width:100%;
    overflow:hidden;
    background:transparent;
    font-family:Arial,sans-serif;
    touch-action:none;
}

.snakeWrap{
    width:100%;
    padding:12px;
    border-radius:16px;
    background:linear-gradient(145deg,#111,#292929);
    color:#fff;
    border:1px solid rgba(255,255,255,.12);
}

.snakeHeader{
    display:flex;
    align-items:center;
    justify-content:space-between;
    margin-bottom:8px;
}

.snakeTitle{
    font-size:20px;
    font-weight:bold;
}

.snakeCreator{
    font-size:9px;
    opacity:.55;
}

.snakeInfo{
    display:flex;
    justify-content:center;
    gap:25px;
    margin-bottom:9px;
    font-size:11px;
    font-weight:bold;
}

.snakeInfo span{
    color:#7ee787;
}

.snakeGame{
    position:relative;
    width:100%;
    max-width:330px;
    margin:auto;
    aspect-ratio:1;
    border-radius:14px;
    overflow:hidden;
    background:#101510;
    border:2px solid #333;
    box-shadow:
        inset 0 0 20px rgba(0,0,0,.5),
        0 4px 15px rgba(0,0,0,.25);
}

#snakeCanvas{
    display:block;
    width:100%;
    height:100%;
}

.snakeStart,
.snakeOver{
    position:absolute;
    inset:0;
    display:flex;
    align-items:center;
    justify-content:center;
    flex-direction:column;
    background:rgba(0,0,0,.55);
    z-index:10;
}

.snakeOver{
    display:none;
}

.snakeOver.show{
    display:flex;
}

.snakeStart.hide{
    display:none;
}

.snakeMessageTitle{
    font-size:24px;
    font-weight:bold;
    margin-bottom:7px;
}

.snakeMessageText{
    font-size:11px;
    opacity:.85;
}

.snakeRestart{
    margin-top:10px;
    padding:9px 20px;
    border:0;
    border-radius:9px;
    background:#fff;
    color:#222;
    font-size:11px;
    font-weight:bold;
}

.snakeControls{
    width:205px;
    margin:14px auto 5px;
    display:grid;
    grid-template-columns:repeat(3,62px);
    grid-template-rows:repeat(2,58px);
    gap:6px;
    justify-content:center;
}

.dirBtn{
    width:62px;
    height:58px;
    border:0;
    border-radius:13px;
    background:#363636;
    color:#fff;
    font-size:25px;
    font-weight:bold;
    box-shadow:
        0 3px 0 #202020,
        inset 0 1px 0 rgba(255,255,255,.08);
    touch-action:manipulation;
}

.dirBtn:active{
    transform:scale(.91);
    box-shadow:0 1px 0 #202020;
    background:#454545;
}

.up{
    grid-column:2;
    grid-row:1;
}

.left{
    grid-column:1;
    grid-row:2;
}

.down{
    grid-column:2;
    grid-row:2;
}

.right{
    grid-column:3;
    grid-row:2;
}

.snakeBottom{
    text-align:center;
    margin-top:7px;
}

.snakeBottomRestart{
    padding:7px 16px;
    border:1px solid rgba(255,255,255,.1);
    border-radius:8px;
    background:#303030;
    color:#ddd;
    font-size:10px;
    font-weight:bold;
}

.snakeHint{
    text-align:center;
    margin-top:7px;
    font-size:8px;
    opacity:.45;
}
</style>

<div class="snakeWrap">

    <div class="snakeHeader">
        <div class="snakeTitle">🐍 SNAKE</div>

        <div class="snakeCreator">
            Apong menendang kursi lipat 😂
        </div>
    </div>

    <div class="snakeInfo">
        <div>SCORE <span id="score">0</span></div>
        <div>BEST <span id="best">0</span></div>
    </div>

    <div class="snakeGame" id="game">

        <canvas id="snakeCanvas"></canvas>

        <div class="snakeStart" id="start">
            <div class="snakeMessageTitle">
                🐍 SNAKE
            </div>

            <div class="snakeMessageText">
                TEKAN TOMBOL UNTUK MULAI
            </div>
        </div>

        <div class="snakeOver" id="over">

            <div class="snakeMessageTitle">
                GAME OVER
            </div>

            <div class="snakeMessageText">
                SCORE:
                <span id="finalScore">0</span>
            </div>

            <button class="snakeRestart" id="restartTop">
                PLAY AGAIN
            </button>

        </div>

    </div>

    <div class="snakeControls">

        <button class="dirBtn up" data-dir="up">
            ⬆
        </button>

        <button class="dirBtn left" data-dir="left">
            ⬅
        </button>

        <button class="dirBtn down" data-dir="down">
            ⬇
        </button>

        <button class="dirBtn right" data-dir="right">
            ➡
        </button>

    </div>

    <div class="snakeBottom">

        <button
            class="snakeBottomRestart"
            id="restartBottom"
        >
            RESTART
        </button>

    </div>

    <div class="snakeHint">
        SWIPE / TOMBOL ARAH UNTUK BERGERAK
    </div>

</div>

<script>
(function(){

const canvas=document.getElementById("snakeCanvas")
const ctx=canvas.getContext("2d")

const game=document.getElementById("game")
const start=document.getElementById("start")
const over=document.getElementById("over")

const scoreEl=document.getElementById("score")
const bestEl=document.getElementById("best")
const finalScore=document.getElementById("finalScore")

const restartTop=document.getElementById("restartTop")
const restartBottom=document.getElementById("restartBottom")

const buttons=document.querySelectorAll(".dirBtn")

let size=0
let cell=0
let dpr=1

const grid=18

let snake=[]
let food={x:0,y:0}

let direction={
    x:1,
    y:0
}

let nextDirection={
    x:1,
    y:0
}

let score=0
let best=0

let running=false
let gameOver=false

let timer=null
let speed=125

let touchStartX=0
let touchStartY=0


let audioContext=null
let musicTimer=null
let musicPlaying=false

function initAudio(){

    try{

        if(!audioContext){

            const AudioCtx=
                window.AudioContext||
                window.webkitAudioContext

            if(!AudioCtx){
                return
            }

            audioContext=new AudioCtx()

        }

        if(
            audioContext.state===
            "suspended"
        ){

            audioContext.resume()

        }

    }catch(e){}

}

function playTone(
    frequency,
    duration,
    type,
    volume,
    delay
){

    try{

        initAudio()

        if(!audioContext){
            return
        }

        const oscillator=
            audioContext.createOscillator()

        const gain=
            audioContext.createGain()

        oscillator.type=
            type||"sine"

        oscillator.frequency.value=
            frequency

        gain.gain.setValueAtTime(
            0,
            audioContext.currentTime+
            (delay||0)
        )

        gain.gain.linearRampToValueAtTime(
            volume||.08,
            audioContext.currentTime+
            (delay||0)+
            .01
        )

        gain.gain.exponentialRampToValueAtTime(
            .001,
            audioContext.currentTime+
            (delay||0)+
            duration
        )

        oscillator.connect(gain)
        gain.connect(audioContext.destination)

        oscillator.start(
            audioContext.currentTime+
            (delay||0)
        )

        oscillator.stop(
            audioContext.currentTime+
            (delay||0)+
            duration+
            .03
        )

    }catch(e){}

}


function eatSound(){

    playTone(
        620,
        .09,
        "square",
        .055,
        0
    )

    playTone(
        880,
        .11,
        "square",
        .045,
        .055
    )

}


function gameOverSound(){

    playTone(
        220,
        .16,
        "sawtooth",
        .08,
        0
    )

    playTone(
        165,
        .20,
        "sawtooth",
        .07,
        .12
    )

    playTone(
        110,
        .30,
        "sawtooth",
        .06,
        .27
    )

}


const musicNotes=[
    261.63,
    329.63,
    392.00,
    329.63,
    293.66,
    349.23,
    440.00,
    349.23
]

let musicIndex=0

function musicStep(){

    if(!musicPlaying){
        return
    }

    try{

        playTone(
            musicNotes[musicIndex],
            .18,
            "triangle",
            .018,
            0
        )

        musicIndex++

        if(
            musicIndex>=
            musicNotes.length
        ){

            musicIndex=0

        }

    }catch(e){}

}

function startMusic(){

    initAudio()

    if(musicPlaying){
        return
    }

    musicPlaying=true
    musicIndex=0

    musicStep()

    clearInterval(musicTimer)

    musicTimer=setInterval(
        musicStep,
        360
    )

}

function stopMusic(){

    musicPlaying=false

    clearInterval(musicTimer)

    musicTimer=null

}


try{

    best=parseInt(
        localStorage.getItem("snake_best")||"0"
    )

    if(!Number.isFinite(best)){
        best=0
    }

}catch(e){

    best=0

}

bestEl.textContent=String(best)

function resize(){

    const rect=game.getBoundingClientRect()

    size=Math.min(
        rect.width,
        rect.height
    )

    dpr=Math.min(
        window.devicePixelRatio||1,
        2
    )

    canvas.width=Math.floor(size*dpr)
    canvas.height=Math.floor(size*dpr)

    canvas.style.width=size+"px"
    canvas.style.height=size+"px"

    ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    )

    cell=size/grid

    draw()

}

function randomFood(){

    let position

    do{

        position={
            x:Math.floor(Math.random()*grid),
            y:Math.floor(Math.random()*grid)
        }

    }while(
        snake.some(
            part=>
                part.x===position.x &&
                part.y===position.y
        )
    )

    food=position

}

function reset(){

    clearInterval(timer)

    score=0
    speed=125

    snake=[
        {
            x:9,
            y:9
        },
        {
            x:8,
            y:9
        },
        {
            x:7,
            y:9
        }
    ]

    direction={
        x:1,
        y:0
    }

    nextDirection={
        x:1,
        y:0
    }

    gameOver=false
    running=true

    start.classList.add("hide")
    over.classList.remove("show")

    randomFood()

    updateScore()
    draw()

    initAudio()
    startMusic()

    timer=setInterval(
        tick,
        speed
    )

}

function updateScore(){

    scoreEl.textContent=String(score)
    bestEl.textContent=String(best)

}

function setDirection(dir){

    initAudio()

    if(!running){

        reset()

    }

    if(gameOver){

        return

    }

    const directions={

        up:{
            x:0,
            y:-1
        },

        down:{
            x:0,
            y:1
        },

        left:{
            x:-1,
            y:0
        },

        right:{
            x:1,
            y:0
        }

    }

    const selected=directions[dir]

    if(!selected){
        return
    }

    if(
        selected.x===-direction.x &&
        selected.y===-direction.y
    ){
        return
    }

    if(
        selected.x===-nextDirection.x &&
        selected.y===-nextDirection.y
    ){
        return
    }

    nextDirection=selected

}

function tick(){

    if(!running){
        return
    }

    direction=nextDirection

    const head={
        x:snake[0].x+direction.x,
        y:snake[0].y+direction.y
    }

    if(
        head.x<0 ||
        head.x>=grid ||
        head.y<0 ||
        head.y>=grid
    ){

        finish()
        return

    }

    const eating=
        head.x===food.x &&
        head.y===food.y

    const bodyToCheck=
        eating
        ? snake
        : snake.slice(0,-1)

    if(
        bodyToCheck.some(
            part=>
                part.x===head.x &&
                part.y===head.y
        )
    ){

        finish()
        return

    }

    snake.unshift(head)

    if(eating){

        score++

        eatSound()

        if(score>best){

            best=score

            try{

                localStorage.setItem(
                    "snake_best",
                    String(best)
                )

            }catch(e){}

        }

        randomFood()

        if(speed>65){

            speed-=4

            clearInterval(timer)

            timer=setInterval(
                tick,
                speed
            )

        }

    }else{

        snake.pop()

    }

    updateScore()
    draw()

}

function finish(){

    running=false
    gameOver=true

    clearInterval(timer)

    stopMusic()

    gameOverSound()

    finalScore.textContent=String(score)

    over.classList.add("show")

    updateScore()

}

function roundedRect(x,y,w,h,r){

    ctx.beginPath()

    ctx.moveTo(x+r,y)

    ctx.arcTo(
        x+w,
        y,
        x+w,
        y+h,
        r
    )

    ctx.arcTo(
        x+w,
        y+h,
        x,
        y+h,
        r
    )

    ctx.arcTo(
        x,
        y+h,
        x,
        y,
        r
    )

    ctx.arcTo(
        x,
        y,
        x+w,
        y,
        r
    )

    ctx.closePath()

}

function drawBackground(){

    ctx.fillStyle="#101510"

    ctx.fillRect(
        0,
        0,
        size,
        size
    )

    for(
        let y=0;
        y<grid;
        y++
    ){

        for(
            let x=0;
            x<grid;
            x++
        ){

            if((x+y)%2===0){

                ctx.fillStyle=
                    "rgba(255,255,255,.018)"

                ctx.fillRect(
                    x*cell,
                    y*cell,
                    cell,
                    cell
                )

            }

        }

    }

}

function drawFood(){

    const cx=
        food.x*cell+
        cell/2

    const cy=
        food.y*cell+
        cell/2

    ctx.fillStyle="#ff4d5a"

    ctx.beginPath()

    ctx.arc(
        cx,
        cy,
        cell*.32,
        0,
        Math.PI*2
    )

    ctx.fill()

    ctx.fillStyle="#7ee787"

    ctx.fillRect(
        cx+cell*.10,
        cy-cell*.38,
        cell*.13,
        cell*.22
    )

}

function drawSnake(){

    snake.forEach(
        (part,index)=>{

            const padding=
                index===0
                ? cell*.08
                : cell*.12

            const x=
                part.x*cell+
                padding

            const y=
                part.y*cell+
                padding

            const s=
                cell-padding*2

            ctx.fillStyle=
                index===0
                ? "#7ee787"
                : "#45b85b"

            roundedRect(
                x,
                y,
                s,
                s,
                cell*.18
            )

            ctx.fill()

            if(index===0){

                ctx.fillStyle="#102010"

                const eyeSize=
                    Math.max(
                        2,
                        cell*.10
                    )

                let eye1x
                let eye1y
                let eye2x
                let eye2y

                if(direction.x!==0){

                    eye1x=
                        direction.x>0
                        ? x+s*.72
                        : x+s*.28

                    eye2x=eye1x

                    eye1y=y+s*.30
                    eye2y=y+s*.70

                }else{

                    eye1x=x+s*.30
                    eye2x=x+s*.70

                    eye1y=
                        direction.y>0
                        ? y+s*.72
                        : y+s*.28

                    eye2y=eye1y

                }

                ctx.beginPath()

                ctx.arc(
                    eye1x,
                    eye1y,
                    eyeSize,
                    0,
                    Math.PI*2
                )

                ctx.arc(
                    eye2x,
                    eye2y,
                    eyeSize,
                    0,
                    Math.PI*2
                )

                ctx.fill()

            }

        }
    )

}

function draw(){

    if(!size){
        return
    }

    ctx.clearRect(
        0,
        0,
        size,
        size
    )

    drawBackground()
    drawFood()
    drawSnake()

}

buttons.forEach(
    button=>{

        button.addEventListener(
            "pointerdown",
            function(e){

                e.preventDefault()

                setDirection(
                    this.dataset.dir
                )

            }
        )

    }
)

restartTop.addEventListener(
    "pointerdown",
    function(e){

        e.preventDefault()

        reset()

    }
)

restartBottom.addEventListener(
    "pointerdown",
    function(e){

        e.preventDefault()

        reset()

    }
)

start.addEventListener(
    "pointerdown",
    function(e){

        e.preventDefault()

        initAudio()
        reset()

    }
)

canvas.addEventListener(
    "touchstart",
    function(e){

        initAudio()

        const touch=e.changedTouches[0]

        touchStartX=touch.clientX
        touchStartY=touch.clientY

    },
    {
        passive:true
    }
)

canvas.addEventListener(
    "touchend",
    function(e){

        const touch=e.changedTouches[0]

        const dx=
            touch.clientX-touchStartX

        const dy=
            touch.clientY-touchStartY

        const absX=Math.abs(dx)
        const absY=Math.abs(dy)

        if(
            absX<20 &&
            absY<20
        ){

            if(!running){
                reset()
            }

            return

        }

        if(absX>absY){

            setDirection(
                dx>0
                ? "right"
                : "left"
            )

        }else{

            setDirection(
                dy>0
                ? "down"
                : "up"
            )

        }

    },
    {
        passive:true
    }
)

document.addEventListener(
    "keydown",
    function(e){

        const keys={

            ArrowUp:"up",
            w:"up",
            W:"up",

            ArrowDown:"down",
            s:"down",
            S:"down",

            ArrowLeft:"left",
            a:"left",
            A:"left",

            ArrowRight:"right",
            d:"right",
            D:"right"

        }

        if(keys[e.key]){

            e.preventDefault()

            setDirection(
                keys[e.key]
            )

        }

    }
)

window.addEventListener(
    "resize",
    resize
)

resize()

})()
</script>
`

    const responseId = randomUUID();

    try {
      await conn.relayMessage(
        m.chat,
    {
        messageContextInfo:{
            deviceListMetadata:{},
            deviceListMetadataVersion:2,
            botMetadata:{
                messageDisclaimerText:"",
                botResponseId:responseId
            }
        },

        botForwardedMessage:{
            message:{
                richResponseMessage:{
                    messageType:1,

                    submessages:[
                        {
                            messageType:2,
                            messageText:"Snake Game"
                        }
                    ],

                    unifiedResponse:{
                        data:Buffer.from(
                            JSON.stringify({
                                response_id:responseId,

                                sections:[
                                    {
                                        view_model:{
                                            primitive:{
                                                __typename:
                                                    "GenAIaeacdsnwHtmlPrimitive",

                                                payload:html,

                                                trusted_sources:[]
                                            },

                                            __typename:
                                                "GenAISingleLayoutViewModel"
                                        }
                                    }
                                ]
                            })
                        ).toString("base64")
                    },

                    contextInfo:{
                        forwardingScore:1,
                        isForwarded:true,

                        forwardedAiBotMessageInfo:{
                            botJid:
                                "867051314767696@bot"
                        },

                        forwardOrigin:4
                    }
                }
            }
        }
    },

        {
          messageId: responseId,
        },
      );
    } catch (e) {
      console.error(e);
      m.reply("Gagal memuat game Snake, coba lagi.");
    }
  },
};