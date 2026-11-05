# SKYBOUND radio script → lines.json
# Every clip the radio can play. The game assembles calls from these pieces
# (callsign + body, or body + numbers), choosing variants at random without repeats.
#
#   python3 tools/radio/lines.py   → tools/radio/lines.json
#
# Voices (Orpheus TTS): "tara" is Skybound Ground, the female controller who
# runs every call and the Flight School. Other voices are background traffic.
import json, os

GROUND = 'tara'
L = []  # {id, group, voice, text}

def add(group, texts, voice=GROUND):
    for i, t in enumerate(texts):
        L.append({'id': f'{group}_{i:02d}', 'group': group, 'voice': voice, 'text': t})

# ------------------------------------------------------------------ callsigns
add('cs_skylane', ['Skylane two seven echo,', 'Two seven echo,', 'Skylane seven echo,'])
add('cs_caravan', ['Caravan four lima,', 'Four lima,', 'Caravan, four lima,'])

# ------------------------------------------------------------------ numbers
DIG = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner']
for d, w in enumerate(DIG):
    L.append({'id': f'dig_{d}', 'group': f'dig_{d}', 'voice': GROUND, 'text': w})
NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
       'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty one',
       'twenty two', 'twenty three', 'twenty four', 'twenty five', 'twenty six', 'twenty seven', 'twenty eight',
       'twenty nine', 'thirty']
for n, w in enumerate(NUM):
    L.append({'id': f'num_{n}', 'group': f'num_{n}', 'voice': GROUND, 'text': w})

add('w_wind', ['Wind', 'Wind is', 'Surface wind'])
add('w_at', ['at'])
add('w_knots', ['knots.'])
add('w_calm', ['Wind calm.', 'Winds are calm.'])
add('w_gusting', ['gusting', 'gusts to'])
add('w_bearing', ['bearing', 'heading', 'on a bearing of'])
add('w_range', ['range', 'distance'])
add('w_km', ['kilometres.', 'clicks out.'])
add('w_km1', ['one kilometre.'])

# ------------------------------------------------------------------ landmark types
TYPES = {'peak': 'the summit', 'lake': 'the lake', 'crater': 'the crater lake', 'island': 'the island',
         'forest': 'the forest', 'river': 'the river', 'pass': 'the mountain pass', 'gorge': 'the gorge',
         'falls': 'the waterfall', 'stacks': 'the sea stacks', 'cape': 'the headland', 'glacier': 'the glacier',
         'spire': 'the rock spire', 'lighthouse': 'the lighthouse', 'wreck': 'the old wreck', 'arch': 'the stone arch'}
for k, v in TYPES.items():
    add(f'type_{k}', [v])
RANKS = ['Student Pilot', 'Private Pilot', 'Bush Pilot', 'Survey Pilot', 'Senior Surveyor', 'Chief Cartographer']
for i, r in enumerate(RANKS):
    add(f'rank_{i}', [r + '.'])

# ------------------------------------------------------------------ departure
add('start_charter', [
    'Skybound Ground, radio check loud and clear. Runway three six, you are cleared for takeoff. Go find us something new.',
    'Morning. Charter is filed, runway three six is yours. Cleared for takeoff.',
    'You are lined up on three six. Cleared for takeoff. Good hunting out there.',
    'Skybound Ground. Charter on file, three landmarks waiting. Runway three six, cleared for takeoff.',
    'Runway three six, cleared for takeoff. The map is blank, so bring it back full.',
    'Got your charter. Nothing on this chart yet but rumours. Cleared for takeoff, three six.',
    'Ground here. Weather is checked, fuel is topped up. Three six, cleared for takeoff.',
    'All yours. Runway three six, cleared for takeoff. Fly low, fly steady, and come home in one piece.',
])
add('start_explore', [
    'No charter today? Fair enough. Runway three six, cleared for takeoff. Chart whatever you like.',
    'Free flight, copy. The whole world is uncharted. Three six, cleared for takeoff.',
    'Cleared for takeoff, three six. No schedule, no route. Just go and see what is out there.',
    'Explorer flight approved. Every question mark out there is yours to name. Cleared for takeoff.',
    'Skybound Ground. Runway three six, cleared for takeoff. Bring back a good story.',
    'Copy, sightseeing. Three six is clear. Off you go.',
])
add('start_cargo', [
    'Bush pilot desk is open. Check the job board, pick a load, and we will get you moving.',
    'Morning. We have freight stacking up in the hangar. Take your pick from the board.',
    'Ground here. Three jobs on the board, all paying. Choose one and we will load you up.',
    'Cargo desk. Folks out at the strips are waiting on you. Pick a delivery.',
    'The board is full today. Pick a job, and mind the weight on climb out.',
])
add('start_daily', [
    'Daily charter, copy. Every pilot flies this one today, so make it count. Cleared for takeoff, three six.',
    'Same world, same route, every pilot today. Let us see what you have got. Cleared for takeoff.',
    'Daily charter on file. The clock starts now. Runway three six, cleared for takeoff.',
    'Everyone is flying this one today. Beat them. Cleared for takeoff, three six.',
])
add('start_strip', [
    'Fresh aircraft is ready at the strip. Clear to depart at your discretion.',
    'You are back on the strip. Departure at your own discretion. Watch the trees.',
    'Strip departure, no traffic reported. Go when ready.',
    'Bush strip, you are clear to go. Plenty of grass, not much else.',
])
add('wx_rain', [
    'Heads up, showers moving through the area. Expect reduced visibility.',
    'Rain in the area today. Keep your eyes on the instruments if it closes in.',
    'We have rain on the field. Windscreen will be busy, take it easy.',
    'Light rain reported out by the strips. Nothing to stop you, just mind your visibility.',
])
add('wx_gusts', [
    'Winds are gusty today. Expect some bumps on climb out.',
    'Gusty conditions on the field. Keep a firm hand on the controls.',
    'Watch the gusts on final today. They have been catching a few people out.',
    'Turbulence reported at low level. Keep your speed up in the gusts.',
])
add('wx_lowcloud', [
    'Cloud base is low today. Stay below it and keep the ground in sight.',
    'Low cloud over the high ground. Do not go poking into it.',
    'Ceilings are low out there. If you lose the horizon, turn back.',
])
add('takeoff', [
    'Positive climb. Nicely done.',
    'You are airborne. Have a good flight.',
    'Wheels up. Turn on course when ready.',
    'Airborne. Climb at your discretion, no traffic reported.',
    'And off you go. Looking good.',
    'Clean departure. Proceed on course.',
    'Nice rotation. Radar contact, you are on your own.',
    'Airborne. Frequency is quiet, call if you need anything.',
])

# ------------------------------------------------------------------ survey
add('brief_first', ['Your first target is', 'First up is', 'Start with', 'Head for'])
add('brief_next', ['Next target is', 'Next up,', 'Now head for', 'Your next one is', 'Moving on to'])
add('target_near', [
    'You are coming up on the target. Get low and steady.',
    'Target is close. Bring it down and hold it level.',
    'Almost there. Slow it down and give us a clean pass.',
    'Coming up on it now. Nice and low.',
    'Target ahead. Keep it smooth through the pass.',
    'You should have it in sight. Low and steady, please.',
    'Getting close. Take your time on this one.',
    'That is your target. Line up a good survey pass.',
])
add('surveying', [
    'That is it, hold it there.',
    'Good, keep it steady.',
    'Survey is running. Do not stop now.',
    'Steady. Steady.',
    'Hold that line.',
    'Lovely. Keep it there.',
])
add('survey_lost', [
    'You drifted off. Bring it back around.',
    'Lost the survey. Go around and try again.',
    'Too far out. Swing back for another pass.',
    'That pass did not count. Try it again, lower.',
])
add('discovery', [
    'Got it. That is on the chart.',
    'Charted. Nice work.',
    'Confirmed, it is on the map now.',
    'Beautiful. That one is yours.',
    'Survey complete. Logging it now.',
    'Copy, landmark charted.',
    'There it is. First pilot ever to see it.',
    'That is a clean survey. Inking it in.',
    'Lovely pass. That is charted.',
    'Recorded. The cartographers will be pleased.',
    'Got the readings. That is a keeper.',
    'Nicely flown. One more off the list.',
])
add('discovery_rare', [
    'Oh, now that is a rare find. <laugh> Well done.',
    'Wait, is that real? That is a rare one. Charting it now.',
    'We have never logged one of those. Incredible find.',
    'Rare discovery confirmed. They will be talking about this one.',
    'Oh wow. That is going in the logbook with a gold star.',
    'Now that is something special. Rare find, charted.',
    'Hold on, let me get that down. That is a rare one.',
    'You do not see that every day. Rare find, logged.',
])
add('charter_surveyed', [
    'That is every target on the charter. Bring it home and land at any strip.',
    'Charter surveyed. All you need now is a good landing.',
    'All targets charted. Pick a strip and put it down gently.',
    'That is the full set. Head for the nearest strip.',
    'Survey complete. Now the hard part. Land it.',
    'Great work. Charter is surveyed. Find a runway and file it.',
    'All three logged. Come on home.',
    'Charter done. Land anywhere you like, as long as it is a runway.',
])
add('charter_surveyed_water', [
    'All targets charted. Now set her down on the lake to file it.',
    'Survey complete. Alight on the lake and we will call it done.',
    'That is the set. Bring it down onto the water, nice and gentle.',
    'Charter surveyed. One water landing and you are finished.',
])
add('gorge_done', [
    'You flew the whole gorge. That is some flying.',
    'End to end through the gorge. Impressive.',
    'Gorge run complete. My heart is still racing.',
])

# ------------------------------------------------------------------ approach & landing
add('approach', [
    'You are lined up. Cleared to land.',
    'Looking good on final. Cleared to land.',
    'Runway is clear. You are cleared to land.',
    'Nice and lined up. Cleared to land, check your speed.',
    'Cleared to land. Watch the diamonds.',
    'On final. Cleared to land, take it slow.',
    'Strip is clear, cleared to land. Mind the trees on short final.',
    'Cleared to land. Gentle now.',
])
add('approach_high', [
    'You are high. Bring the power back.',
    'Little high on the glide path.',
    'High on approach. Ease the nose down.',
    'You are well above the slope. Lose some height.',
    'Too high. Go around if you need to.',
])
add('approach_low', [
    'You are low. Add some power.',
    'Low on the glide path, watch it.',
    'Too low. Bring the nose up a touch.',
    'Check your height. You are below the slope.',
    'Low and slow is how people get hurt. Add power.',
])
add('approach_fast', [
    'You are fast. Bleed off some speed.',
    'Too much speed for this strip.',
    'Check your airspeed. You are hot.',
    'Slow it down, you will float halfway down the strip.',
])
add('land_S', [
    '<laugh> Butter. Absolute butter.',
    'Did you even touch down? Beautiful landing.',
    'Now that is how you land an aeroplane.',
    'Textbook. Not a bounce. Lovely.',
    'Smooth as silk. Nicely done.',
    'I could not have done that better myself.',
    'Perfect landing. Frame that one.',
    'Wow. Greased it.',
])
add('land_A', [
    'Smooth landing. Well flown.',
    'Very nice touchdown.',
    'Good landing. Clean and on the centreline.',
    'Lovely arrival. Welcome back.',
    'Nice one. The passengers would clap.',
    'Solid landing. Well done.',
    'Good touchdown. That is a pilot.',
    'Very tidy. Nicely flown.',
])
add('land_B', [
    'Good landing. Welcome back.',
    'Down and safe. Nicely done.',
    'Not bad at all. Welcome in.',
    'Decent landing. You are down.',
    'Good arrival. Taxi when ready.',
    'That will do nicely.',
])
add('land_C', [
    'Bit firm, but you are down.',
    'Firm landing. The tyres felt that one.',
    'You are down. Maybe a little softer next time.',
    'Arrived. Firmly.',
    'That was a firm one. Everyone okay in there?',
    'Down safely. We will call that a firm arrival.',
])
add('land_D', [
    'Ouch. Maintenance will want a word.',
    'That was a hard landing. Is everything still attached?',
    '<sigh> Well, you are on the ground.',
    'Hard landing. Let us check those struts.',
    'Any landing you walk away from, I suppose.',
    'That one rattled the tower windows.',
])
add('land_field', [
    'That is not a runway, but you are down. Bush landing logged.',
    'Off airport landing. Bold. Charters still need a proper strip.',
    'You put it down in a field. Fair enough.',
    'Field landing, copy. Find a strip to file the charter.',
    'Well, that is one way to land. Not a strip, though.',
])
add('land_water', [
    'Nice alighting. Welcome to the lake.',
    'Smooth on the water. Lovely.',
    'Down on the lake. Nicely done.',
    'Water landing logged. Mind the shoreline.',
])
add('charter_complete', [
    'Charter complete. Excellent work today.',
    'That is the charter filed. Great flying.',
    'All done. The chart looks fantastic.',
    'Charter closed out. Drinks are on the cargo desk.',
    'Complete. The cartographers owe you one.',
    'And that is a wrap on the charter. Well done.',
    'Charter filed. You are making this look easy.',
    'Mission complete. Proud of you, pilot.',
])
add('rank_up', [
    'Congratulations, you have been promoted to',
    'Big news from the office. You are now',
    'Well earned. Promotion confirmed,',
    'They have made it official. You are now',
    'Congratulations, pilot. New rank,',
])

# ------------------------------------------------------------------ cargo
add('job_medical', [
    'Medical supplies are aboard. Somebody needs these fast. Do not hang about.',
    'Medical run. The clock is ticking on this one.',
    'Medicine for the strip. Fly fast, land soft.',
    'Urgent medical cargo. Every minute counts.',
])
add('job_fuel', [
    'Fuel drums loaded. She is heavy, so expect a slow climb.',
    'You have got fuel drums aboard. Long takeoff roll, mind the trees.',
    'Heavy load of fuel. Treat her gently on climb out.',
])
add('job_mail', [
    'Mail and parcels are aboard. Someone out there is waiting on a letter.',
    'Mail run. Light load, easy money.',
    'Parcels loaded. Do not shake them about too much.',
])
add('job_crew', [
    'Survey crew is aboard. Try not to scare them.',
    'Passengers on this one. Smooth flying, please.',
    'Crew is strapped in. They asked for a gentle landing.',
])
add('job_supplies', [
    'Fresh supplies loaded. The strip is running low.',
    'Supplies are aboard. They are counting on you out there.',
    'Food and supplies loaded. Go when ready.',
])
add('delivered', [
    'Delivery confirmed. Payment is on its way.',
    'Cargo delivered. Nice work.',
    'They have got it. The money is in your account.',
    'Delivered safe and sound. Check the board for your next job.',
    'Good delivery. The strip says thank you.',
    'Signed, sealed, delivered. Payment received.',
    'Cargo is off. Another happy customer.',
    'Delivery complete. Pick your next load.',
])
add('delivered_late', [
    'You made it, but you are late. They docked your pay.',
    'Delivered, just not in time. Reduced payment.',
    'They got it, eventually. Late fee applied.',
    'Late, but delivered. Faster next time.',
])

# ------------------------------------------------------------------ warnings & emergencies
add('stall', [
    'Watch your airspeed!',
    'You are stalling, nose down!',
    'Airspeed! Push forward!',
    'Stall! Lower the nose and add power!',
    'Too slow, too slow!',
    'Careful, you are losing it. Nose down!',
])
add('terrain', [
    'Terrain! Pull up!',
    'Check your altitude, you are very low!',
    'Ground is coming up fast!',
    'Pull up, pull up!',
    'You are too low, climb!',
])
add('fuel_low', [
    'Fuel is getting low. Find a strip soon.',
    'Low fuel. Start thinking about where you are landing.',
    'You are running on fumes. Head for a strip.',
    'Fuel state is low. Do not push it.',
])
add('fuel_out', [
    'Engine out! Pick a field and glide.',
    'You are out of fuel. Best glide, find somewhere flat.',
    'Engine has quit. Keep your speed up and pick a landing spot.',
    'Dead stick! Glide it down, you can do this.',
])
add('crash', [
    'Mayday, mayday. We have lost contact. Rescue is on the way.',
    'Skybound Ground to all stations, aircraft down. Dispatching rescue.',
    'Oh no. We have lost them. Get the crash team out there.',
    'Aircraft down, aircraft down. Rolling the rescue crew now.',
    'We lost your signal. Hang on, help is coming.',
    'That is a crash. Emergency services, go, go, go.',
    'Mayday received. Stay with the aircraft, rescue is inbound.',
    'Impact reported. Get the helicopter up.',
    'We just lost you on radar. Rescue crews are rolling.',
    'Aircraft is down. Somebody get out there now.',
])
add('ditch', [
    'They have gone into the water! Get the boats out!',
    'Aircraft in the water, aircraft in the water!',
    'Ditched! Rescue boats are on the way.',
    'That aircraft does not float. Sending the boats.',
])
add('respawn', [
    'Fresh aircraft is ready. Let us try that again.',
    'New aircraft fuelled and waiting. Shake it off.',
    'Okay, deep breath. You are back on the ground and ready to go.',
    'The hangar found you another one. Try to bring this one back.',
    'Spare aircraft is ready. The charter is still open.',
])

# ------------------------------------------------------------------ Flight School (Skybound Ground teaches)
add('tut_welcome', [
    'Welcome to Flight School. I will be on the radio the whole way. Let us get you flying.',
    'Hi there. This is Skybound Ground. I will talk you through your first flight. Ready? Let us go.',
])
add('tut_0', [
    'First, power. Bring the throttle up smoothly, all the way past ninety percent.',
    'Let us start with the throttle. Push it up nice and smooth, ninety percent or more.',
])
add('tut_1', [
    'Good. Now keep her straight and let the speed build. Hands off the controls until fifty eight knots.',
    'Keep it straight down the centreline. Do not touch the stick, let the speed build to fifty eight knots.',
])
add('tut_2', [
    'There is your speed. Gently raise the nose. Small input, no yanking.',
    'Fifty eight knots. Ease the nose up, gently, and let her fly.',
])
add('tut_3', [
    'You are flying! Hold a shallow climb and keep the wings level. Two hundred feet, please.',
    'Airborne! Small corrections now. Climb to two hundred feet with the wings level.',
])
add('tut_4', [
    'Lovely. The gear on this one is fixed, so nothing to retract. Just hold a steady climb with the wings level.',
    'Nice. Hold that climb steady. Wings level, nose a little up.',
])
add('tut_5', [
    'Now a turn. Aeroplanes turn by banking. Roll into a gentle fifteen degree bank.',
    'Let us try a turn. Bank gently to one side, about fifteen degrees.',
])
add('tut_6', [
    'Good turn. Now roll the wings back to level. Small, gentle input the other way.',
    'Now level the wings. Ease it back to centre, no big inputs.',
])
add('tut_7', [
    'Time for some real work. Follow the cyan diamond to a question mark, then fly a low, steady pass until the ring fills.',
    'See the cyan diamond on the compass? That is an uncharted landmark. Fly to it, get low, and hold steady until it is charted.',
])
add('tut_8', [
    'Brilliant. Now land it. Turn toward a strip, line up until the approach guide appears, and keep both diamonds centred.',
    'Last lesson, the landing. Line up with a strip, reduce power, keep the diamonds centred, and flare just above the ground.',
])
add('tut_9', [
    'And that is it. You are a pilot. The whole world is out there, go chart it.',
    'Flight School complete. Honestly? You are a natural. Go and explore.',
])
add('tut_good', [
    'Nice.',
    'Perfect.',
    'Good, that is it.',
    'Lovely.',
    'Well done.',
    'Exactly right.',
    'Great job.',
    'There you go.',
])
add('tut_hint', [
    'Take your time. Small, gentle inputs.',
    'No rush. Read the panel if you are stuck.',
    'You have got this. Smooth and steady.',
    'Try a little more input. Gently.',
    'Still with me? Check the instructions on the panel.',
])

# ------------------------------------------------------------------ landing coach (neural network advice on final)
add('coach_power_up', ['Add a little power.', 'More power, you are sinking.', 'Power up a touch.', 'You are going to land short. Add power.'])
add('coach_power_down', ['Ease the power back.', 'Bit fast. Bring the power back.', 'Reduce power, you will float.', 'Too much speed. Throttle back.'])
add('coach_nose_up', ['Nose up a touch.', 'Raise the nose slightly.', 'Start your flare now.', 'Ease back, flare.'])
add('coach_nose_down', ['Lower the nose a little.', 'Nose down, you are floating.', 'Ease the nose down.', 'You are getting slow. Nose down.'])
add('coach_left', ['Come left a touch.', 'Drift left, back to the centreline.', 'Little left.', 'You are right of centre. Come left.'])
add('coach_right', ['Come right a touch.', 'Ease right, onto the centreline.', 'Little right.', 'You are left of centre. Come right.'])
add('coach_good', ['Looking good, hold it there.', 'Perfect. Keep it just like that.', 'Nice and stable. Hold it.', 'That is a lovely approach.'])

# ------------------------------------------------------------------ the secret F-16 ("fly" cheat)
add('cs_viper', ['Viper one one,', 'Viper,', 'Viper one one, Skybound Ground,'])
add('jet_on', [
    'Wait. Is that an F-16 on my runway? Who signed that out?',
    'Ground to all stations, we have a fighter jet on the field. Do not ask me how.',
    '<gasp> Where did that come from? Okay. Okay. Viper one one, try not to break anything.',
    'That is not a Cessna. That is very much not a Cessna.',
    'Somebody just swapped your aeroplane for an F-16. I am not even going to ask.',
    'Viper one one, welcome to Skybound. Please keep it below the speed of sound over the cabins.',
])
add('jet_off', [
    'And the F-16 is gone. Back to something sensible.',
    'Welcome back to the slow lane. My ears thank you.',
    'Cessna again? Probably for the best.',
])
add('jet_takeoff', [
    'Airborne, and climbing like a rocket. Have fun.',
    'Viper is airborne. That was loud.',
    'Off you go. I felt that one in my chest.',
    'Gear up, and away. Show off.',
])
add('jet_ab', [
    'Easy on the burner, you are rattling the tower windows.',
    'Afterburner lit. The whole valley heard that.',
    'Full reheat? Somebody is in a hurry.',
    'That is a lot of fire coming out of the back of that thing.',
])
add('jet_boom', [
    'Was that a sonic boom? <laugh> You just broke every window in the valley.',
    'Supersonic! The sheep are going to need therapy.',
    'And that is Mach one. Nicely done, Viper.',
    'Boom. I think the cabins on the ridge just lost their windows.',
])

# ------------------------------------------------------------------ YOUR readbacks (the player pilot, male voice)
PILOT = 'dan'
add('pb_cs_skylane', ['two seven echo.', 'Skylane two seven echo.'], voice=PILOT)
add('pb_cs_caravan', ['four lima.', 'Caravan four lima.'], voice=PILOT)
add('pb_cs_viper', ['Viper one one.', 'Viper.'], voice=PILOT)
add('rb_takeoff', ['Cleared for takeoff, three six,', 'Three six, cleared for takeoff,', 'Cleared for takeoff, rolling,', 'Copy, cleared for takeoff,'], voice=PILOT)
add('rb_land', ['Cleared to land,', 'Copy, cleared to land,', 'Cleared to land, thanks,'], voice=PILOT)
add('rb_copy', ['Copy that,', 'Roger,', 'Wilco,', 'Copy,', 'Understood,', 'Roger that,'], voice=PILOT)
add('rb_thanks', ['Thanks, Ground,', 'Appreciate it, Ground,', 'Thank you,', 'Cheers, Ground,'], voice=PILOT)
add('rb_job', ['Copy, loaded and rolling,', 'Cargo aboard, on our way,', 'Copy, we have the load,'], voice=PILOT)
add('rb_unable', ['Copy, working on it,', 'Roger, correcting,', 'Copy, fixing that now,'], voice=PILOT)

# ------------------------------------------------------------------ traffic advisories (Ground → you, about AI traffic)
add('tfc_lead', ['Traffic,', 'Traffic alert,', 'Heads up, traffic,', 'Traffic for you,'])
CLOCK = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven']
for i, w in enumerate(CLOCK):
    add(f'tfc_clock_{i}', [f"{w} o'clock,"])
add('tfc_mi_1', ['one mile,', 'about a mile,'])
add('tfc_mi_2', ['two miles,'])
add('tfc_mi_3', ['three miles,'])
add('tfc_same', ['same altitude.', 'at your altitude.'])
add('tfc_above', ['slightly above you.', 'a few hundred feet above.'])
add('tfc_below', ['slightly below you.', 'a few hundred feet below.'])
add('tfc_type_skylane', ['a Skylane,'])
add('tfc_type_caravan', ['a Caravan,'])
add('tfc_type_f16', ['your wingman,'])
add('rb_looking', ['Looking,', 'Looking for the traffic,', 'Eyes out, looking,'], voice=PILOT)
add('rb_insight', ['Traffic in sight,', 'Got them, in sight,', 'Tally, traffic in sight,'], voice=PILOT)

# ------------------------------------------------------------------ background chatter (other traffic)
add('chat_ground', [
    'Caravan niner kilo, taxi to runway three six via alpha, hold short.',
    'Beaver one two zulu, wind two four zero at eight, cleared to land.',
    'Otter five six, traffic is a Skylane on climb out, report in sight.',
    'Cub three echo, radio check, five by five.',
    'All stations, fuel truck is crossing the apron, stand by.',
    'Beaver one two zulu, welcome back, park on the grass by the hangar.',
    'Otter five six, the north strip is soft today, use the eastern end.',
    'Caravan niner kilo, cleared for takeoff, have a good one.',
    'Cub three echo, the cargo desk says your parcels are ready.',
    'All stations, birds reported near the river, keep a good lookout.',
    'Otter five six, say again, you were broken.',
    'Beaver one two zulu, roger, rescue team is stood down. Good to hear you.',
])
CH = [('leo', [
    'Ground, Caravan niner kilo, ready to taxi with information bravo.',
    'Caravan niner kilo, holding short three six.',
    'Niner kilo, rolling. Thanks, Ground.',
    'Ground, niner kilo, we have the lake in sight, descending for the water.',
]), ('dan', [
    'Ground, Beaver one two zulu, ten miles south with the mail.',
    'One two zulu, cleared to land, wind copied.',
    'Beaver one two zulu, on the grass, shutting down. Long day.',
    'One two zulu, we are fine, just a bumpy one over the ridge.',
]), ('zac', [
    'Otter five six, looking for the traffic.',
    'Five six, traffic in sight, will pass behind.',
    'Otter five six, copy the soft strip, thanks for the heads up.',
    'Five six, say again Ground, you are breaking up.',
]), ('jess', [
    'Cub three echo, radio check.',
    'Three echo, loud and clear, thank you.',
    'Cub three echo, picking up parcels, back in twenty.',
    'Three echo, birds in sight by the river, climbing.',
])]
for v, texts in CH:
    add(f'chat_{v}', texts, voice=v)

os.makedirs(os.path.dirname(os.path.abspath(__file__)), exist_ok=True)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lines.json')
with open(out, 'w') as f:
    json.dump(L, f, indent=1)
print(len(L), 'clips,', len({l['group'] for l in L}), 'groups →', out)
