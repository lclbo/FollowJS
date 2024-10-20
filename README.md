# FollowJS - Gamepad Followspot Control

This project implements a followspot-control via ArtNet, using generic gamepad controllers as input.
It uses electron to create a standalone app, using the default browser access to system-connected gamepad controllers. Though it was built having Xbox controllers in mind, many other gamepads should work as well, but the mapping might be different.

All general configurations are stored within the ```config``` directory.
Spot-specific configurations are stored within the ```config/spots``` directory. On startup, one spot entity is created per file in this directory. 
There is a 1:1 mapping between controllers and spots. The controllers will always be enumerated in the order they are connected (which is a privacy limitation from the web gamepad API), so a spot cannot be tied to a specific controller.

The spot position will be painted to the video or image view. The position is calculated using the ```cp2tform``` transformation. The calibration data processing is packed into a GNU Octave script. After importing the calibration points, it will create the correction parameters which are stored inside the spot configuration.

## Quickstart
The [package.json](package.json) file provide targets for either directly running or building and packing the electron app. 
```npm run pack``` creates x64 Windows and Mac installers and binaries.


---
Have fun to use and modify this code, but remember that everything is at your own risk. 
