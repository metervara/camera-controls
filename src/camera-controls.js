import { EventDispatcher } from './event-dispatcher';

let THREE;
let _v3a;
let _v3b;
let _xColumn;
let _yColumn;
const EPSILON = 0.001;
const STATE = {
    NONE: - 1,
    ROTATE: 0,
    DOLLY: 1,
    TRUCK: 2,
    TOUCH_ROTATE: 3,
    TOUCH_DOLLY: 4,
    TOUCH_TRUCK: 5
};

export default class CameraControls extends EventDispatcher {

    static install(libs) {

        THREE = libs.THREE;
        _v3a = new THREE.Vector3();
        _v3b = new THREE.Vector3();
        _xColumn = new THREE.Vector3();
        _yColumn = new THREE.Vector3();

    }

    constructor(object, domElement) {

        super();

        this.object = object;
        this.enabled = true;

        // For fixed speed rotation ()
        this.fixedRotation = false
        this.fixedRotationCircumference = 500; //Distance in pixels for a full revolution

        // How far you can dolly in and out ( PerspectiveCamera only )
        this.minDistance = 0;
        this.maxDistance = Infinity;

        // How far you can zoom in and out ( OrthographicCamera only )
        this.minZoom = 0;
        this.maxZoom = Infinity;

        this.minPolarAngle = 0; // radians
        this.maxPolarAngle = Math.PI; // radians
        this.minAzimuthAngle = - Infinity; // radians
        this.maxAzimuthAngle = Infinity; // radians
        this.dampingFactor = 0.05;
        this.draggingDampingFactor = 0.25;
        this.dollySpeed = 1.0;
        this.truckSpeed = 2.0;
        this.verticalDragToForward = false;

        this.domElement = domElement;

        // the location of focus, where the object orbits around
        this._target = new THREE.Vector3();
        this._targetEnd = new THREE.Vector3();

        // rotation
        this._spherical = new THREE.Spherical();
        this._spherical.setFromVector3(this.object.position);
        this._sphericalEnd = new THREE.Spherical().copy(this._spherical);

        // reset
        this._target0 = this._target.clone();
        this._position0 = this.object.position.clone();
        this._zoom0 = this.object.zoom;

        this._needsUpdate = true;
        this.update();

        if (!this.domElement) {

            this.dispose = () => { };

        } else {

            const scope = this;
            const dragStart = new THREE.Vector2();
            const dollyStart = new THREE.Vector2();
            let state = STATE.NONE;
            let elementRect;
            let savedDampingFactor;

            this.domElement.addEventListener('mousedown', onMouseDown);
            this.domElement.addEventListener('touchstart', onTouchStart);
            this.domElement.addEventListener('wheel', onMouseWheel);
            this.domElement.addEventListener('contextmenu', onContextMenu);

            this.dispose = () => {

                scope.domElement.removeEventListener('mousedown', onMouseDown);
                scope.domElement.removeEventListener('touchstart', onTouchStart);
                scope.domElement.removeEventListener('wheel', onMouseWheel);
                scope.domElement.removeEventListener('contextmenu', onContextMenu);
                document.removeEventListener('mousemove', dragging);
                document.removeEventListener('touchmove', dragging);
                document.removeEventListener('mouseup', endDragging);
                document.removeEventListener('touchend', endDragging);

            };

            function onMouseDown(event) {

                if (!scope.enabled) return;

                event.preventDefault();

                const prevState = state;

                switch (event.button) {

                    case THREE.MOUSE.LEFT:

                        state = STATE.ROTATE;
                        break;

                    case THREE.MOUSE.MIDDLE:

                        state = STATE.DOLLY;
                        break;

                    case THREE.MOUSE.RIGHT:

                        state = STATE.TRUCK;
                        break;

                }

                if (prevState === STATE.NONE) {

                    startDragging(event);

                }

            }

            function onTouchStart(event) {

                if (!scope.enabled) return;

                event.preventDefault();

                const prevState = state;

                switch (event.touches.length) {

                    case 1:	// one-fingered touch: rotate

                        state = STATE.TOUCH_ROTATE;
                        break;

                    case 2:	// two-fingered touch: dolly

                        state = STATE.TOUCH_DOLLY;
                        break;

                    case 3: // three-fingered touch: truck

                        state = STATE.TOUCH_TRUCK;
                        break;

                }

                if (prevState === STATE.NONE) {

                    startDragging(event);

                }

            }


            function onMouseWheel(event) {

                if (!scope.enabled) return;

                event.preventDefault();

                if (event.deltaY < 0) {

                    dollyIn();

                } else if (event.deltaY > 0) {

                    dollyOut();

                }

            }

            function onContextMenu(event) {

                if (!scope.enabled) return;

                event.preventDefault();

            }

            function startDragging(event) {

                if (!scope.enabled) return;

                event.preventDefault();

                const _event = !!event.touches ? event.touches[0] : event;
                const x = _event.clientX;
                const y = _event.clientY;

                elementRect = scope.domElement.getBoundingClientRect();
                dragStart.set(x, y);

                // if ( state === STATE.DOLLY ) {

                // 	dollyStart.set( x, y );

                // }

                if (state === STATE.TOUCH_DOLLY) {

                    const dx = x - event.touches[1].pageX;
                    const dy = y - event.touches[1].pageY;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    dollyStart.set(0, distance);

                }

                savedDampingFactor = scope.dampingFactor;
                scope.dampingFactor = scope.draggingDampingFactor;

                document.addEventListener('mousemove', dragging, { passive: false });
                document.addEventListener('touchmove', dragging, { passive: false });
                document.addEventListener('mouseup', endDragging);
                document.addEventListener('touchend', endDragging);

                scope.dispatchEvent({
                    type: 'controlstart',
                    x,
                    y,
                    state,
                    originalEvent: event,
                });

            }

            function dragging(event) {

                if (!scope.enabled) return;

                event.preventDefault();

                const _event = !!event.touches ? event.touches[0] : event;
                const x = _event.clientX;
                const y = _event.clientY;

                const deltaX = dragStart.x - x;
                const deltaY = dragStart.y - y;

                dragStart.set(x, y);

                switch (state) {

                    case STATE.ROTATE:
                    case STATE.TOUCH_ROTATE:

                        //Causes different rotation speeds in X & Y
                        if(this.fixedSpeedRotation) {
                            const rotX = 2 * Math.PI * deltaX / this.fixedRotationCircumference;
                            const rotY = 2 * Math.PI * deltaY / this.fixedRotationCircumference;
                            scope.rotate(rotX, rotY, true);
                        } else {
                            const rotX = 2 * Math.PI * deltaX / elementRect.width;
                            const rotY = 2 * Math.PI * deltaY / elementRect.height;
                            scope.rotate(rotX, rotY, true);
                        }
                        break;

                    case STATE.DOLLY:
                        // not implemented
                        break;

                    case STATE.TOUCH_DOLLY:

                        const dx = x - event.touches[1].pageX;
                        const dy = y - event.touches[1].pageY;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        const dollyDelta = dollyStart.y - distance;

                        if (dollyDelta > 0) {

                            dollyOut();

                        } else if (dollyDelta < 0) {

                            dollyIn();

                        }

                        dollyStart.set(0, distance);
                        break;

                    case STATE.TRUCK:
                    case STATE.TOUCH_TRUCK:

                        if (scope.object.isPerspectiveCamera) {

                            const offset = _v3a.copy(scope.object.position).sub(scope._target);
                            // half of the fov is center to top of screen
                            const fovInRad = scope.object.fov * THREE.Math.DEG2RAD;
                            const targetDistance = offset.length() * Math.tan((fovInRad / 2));
                            const truckX = (scope.truckSpeed * deltaX * targetDistance / elementRect.height);
                            const pedestalY = (scope.truckSpeed * deltaY * targetDistance / elementRect.height);
                            if (scope.verticalDragToForward) {

                                scope.truck(truckX, 0, true);
                                scope.forward(- pedestalY, true);

                            } else {

                                scope.truck(truckX, pedestalY, true);

                            }
                            break;

                        } else if (scope.object.isOrthographicCamera) {

                            // orthographic
                            const truckX = deltaX * (scope.object.right - scope.object.left) / scope.object.zoom / elementRect.width;
                            const pedestalY = deltaY * (scope.object.top - scope.object.bottom) / scope.object.zoom / elementRect.height;
                            scope.truck(truckX, pedestalY, true);
                            break;

                        }

                }

                scope.dispatchEvent({
                    type: 'control',
                    x,
                    y,
                    deltaX,
                    deltaY,
                    state,
                    originalEvent: event,
                });

            }

            function endDragging() {

                if (!scope.enabled) return;

                scope.dampingFactor = savedDampingFactor;
                state = STATE.NONE;

                document.removeEventListener('mousemove', dragging);
                document.removeEventListener('touchmove', dragging);
                document.removeEventListener('mouseup', endDragging);
                document.removeEventListener('touchend', endDragging);

                scope.dispatchEvent({
                    type: 'controlend',
                    state,
                    originalEvent: event,
                });

            }

            function dollyIn() {

                const dollyScale = Math.pow(0.95, scope.dollySpeed);

                if (scope.object.isPerspectiveCamera) {

                    scope.dolly(scope._sphericalEnd.radius * dollyScale - scope._sphericalEnd.radius);

                } else if (scope.object.isOrthographicCamera) {

                    scope.object.zoom = Math.max(scope.minZoom, Math.min(scope.maxZoom, scope.object.zoom * dollyScale));
                    scope.object.updateProjectionMatrix();
                    scope._needsUpdate = true;

                }

            }

            function dollyOut() {

                const dollyScale = Math.pow(0.95, scope.dollySpeed);

                if (scope.object.isPerspectiveCamera) {

                    scope.dolly(scope._sphericalEnd.radius / dollyScale - scope._sphericalEnd.radius);

                } else if (scope.object.isOrthographicCamera) {

                    scope.object.zoom = Math.max(scope.minZoom, Math.min(scope.maxZoom, scope.object.zoom / dollyScale));
                    scope.object.updateProjectionMatrix();
                    scope._needsUpdate = true;

                }

            }

        }

    }

    // rotX in radian
    // rotY in radian
    rotate(rotX, rotY, enableTransition) {

        this.rotateTo(
            this._sphericalEnd.theta + rotX,
            this._sphericalEnd.phi + rotY,
            enableTransition
        );

    }

    // rotX in radian
    // rotY in radian
    rotateTo(rotX, rotY, enableTransition) {

        const theta = Math.max(this.minAzimuthAngle, Math.min(this.maxAzimuthAngle, rotX));
        const phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, rotY));

        this._sphericalEnd.theta = theta;
        this._sphericalEnd.phi = phi;
        this._sphericalEnd.makeSafe();

        if (!enableTransition) {

            this._spherical.theta = this._sphericalEnd.theta;
            this._spherical.phi = this._sphericalEnd.phi;

        }

        this._needsUpdate = true;

    }

    dolly(distance, enableTransition) {

        if (this.object.isOrthographicCamera) {

            console.warn('dolly is not available for OrthographicCamera');
            return;

        }

        this.dollyTo(this._sphericalEnd.radius + distance, enableTransition);

    }

    dollyTo(distance, enableTransition) {

        if (this.object.isOrthographicCamera) {

            console.warn('dolly is not available for OrthographicCamera');
            return;

        }

        this._sphericalEnd.radius = THREE.Math.clamp(
            distance,
            this.minDistance,
            this.maxDistance
        );

        if (!enableTransition) {

            this._spherical.radius = this._sphericalEnd.radius;

        }

        this._needsUpdate = true;

    }

    pan(x, y, enableTransition) {

        console.log('`pan` has been renamed to `truck`');
        this.truck(x, y, enableTransition);

    }

    truck(x, y, enableTransition) {

        this.object.updateMatrix();

        _xColumn.setFromMatrixColumn(this.object.matrix, 0);
        _yColumn.setFromMatrixColumn(this.object.matrix, 1);
        _xColumn.multiplyScalar(x);
        _yColumn.multiplyScalar(- y);

        const offset = _v3a.copy(_xColumn).add(_yColumn);
        this._targetEnd.add(offset);

        if (!enableTransition) {

            this._target.copy(this._targetEnd);

        }

        this._needsUpdate = true;

    }

    forward(distance, enableTransition) {

        _v3a.setFromMatrixColumn(this.object.matrix, 0);
        _v3a.crossVectors(this.object.up, _v3a);
        _v3a.multiplyScalar(distance);

        this._targetEnd.add(_v3a);

        if (!enableTransition) {

            this._target.copy(this._targetEnd);

        }

        this._needsUpdate = true;

    }

    moveTo(x, y, z, enableTransition) {

        this._targetEnd.set(x, y, z);

        if (!enableTransition) {

            this._target.copy(this._targetEnd);

        }

        this._needsUpdate = true;

    }

    fitTo(objectOrBox3, enableTransition, options = {}) {

        if (this.object.isOrthographicCamera) {

            console.warn('fitTo is not supported for OrthographicCamera');
            return;

        }

        const paddingLeft = options.paddingLeft || 0;
        const paddingRight = options.paddingRight || 0;
        const paddingBottom = options.paddingBottom || 0;
        const paddingTop = options.paddingTop || 0;

        const boundingBox = objectOrBox3.isBox3 ? objectOrBox3.clone() : new THREE.Box3().setFromObject(objectOrBox3);
        const size = boundingBox.getSize(_v3a);
        const boundingWidth = size.x + paddingLeft + paddingRight;
        const boundingHeight = size.y + paddingTop + paddingBottom;
        const boundingDepth = size.z;

        const distance = this.getDistanceToFit(boundingWidth, boundingHeight, boundingDepth);
        this.dollyTo(distance, enableTransition);

        const boundingBoxCenter = boundingBox.getCenter(_v3a);
        const cx = boundingBoxCenter.x - (paddingLeft * 0.5 - paddingRight * 0.5);
        const cy = boundingBoxCenter.y + (paddingTop * 0.5 - paddingBottom * 0.5);
        const cz = boundingBoxCenter.z;
        this.moveTo(cx, cy, cz, enableTransition);

        this._sanitizeSphericals();
        this.rotateTo(0, 90 * THREE.Math.DEG2RAD, enableTransition);

    }

    setLookAt(
        positionX, positionY, positionZ,
        targetX, targetY, targetZ,
        enableTransition
    ) {

        const position = _v3a.set(positionX, positionY, positionZ);
        const target = _v3b.set(targetX, targetY, targetZ);

        this._targetEnd.copy(target);
        this._sphericalEnd.setFromVector3(position.sub(target));
        this._sanitizeSphericals();

        if (!enableTransition) {

            this._target.copy(this._targetEnd);
            this._spherical.copy(this._sphericalEnd);

        }

        this._needsUpdate = true;

    }

    lerpLookAt(
        positionAX, positionAY, positionAZ,
        targetAX, targetAY, targetAZ,
        positionBX, positionBY, positionBZ,
        targetBX, targetBY, targetBZ,
        x, enableTransition
    ) {

        const positionA = _v3a.set(positionAX, positionAY, positionAZ);
        const targetA = _v3b.set(targetAX, targetAY, targetAZ);
        const sphericalA = new THREE.Spherical().setFromVector3(positionA.sub(targetA));

        const targetB = _v3a.set(targetBX, targetBY, targetBZ);
        this._targetEnd.copy(targetA).lerp(targetB, x); // tricky

        const positionB = _v3b.set(positionBX, positionBY, positionBZ);
        const sphericalB = new THREE.Spherical().setFromVector3(positionB.sub(targetB));

        const deltaTheta = sphericalB.theta - sphericalA.theta;
        const deltaPhi = sphericalB.phi - sphericalA.phi;
        const deltaRadius = sphericalB.radius - sphericalA.radius;

        this._sphericalEnd.set(
            sphericalA.radius + deltaRadius * x,
            sphericalA.phi + deltaPhi * x,
            sphericalA.theta + deltaTheta * x
        );

        this._sanitizeSphericals();

        if (!enableTransition) {

            this._target.copy(this._targetEnd);
            this._spherical.copy(this._sphericalEnd);

        }

        this._needsUpdate = true;

    }

    setPosition(positionX, positionY, positionZ, enableTransition) {

        this.setLookAt(
            positionX, positionY, positionZ,
            this._targetEnd.x, this._targetEnd.y, this._targetEnd.z,
            enableTransition
        );

    }

    setTarget(targetX, targetY, targetZ, enableTransition) {

        const pos = this.getPosition(_v3a);
        this.setLookAt(
            pos.x, pos.y, pos.z,
            targetX, targetY, targetZ,
            enableTransition
        );

    }

    getDistanceToFit(width, height, depth) {

        const camera = this.object;
        const boundingRectAspect = width / height;
        const fov = camera.fov * THREE.Math.DEG2RAD;
        const aspect = camera.aspect;

        const heightToFit = boundingRectAspect < aspect ? height : width / aspect;
        return heightToFit * 0.5 / Math.tan(fov * 0.5) + depth * 0.5;

    }

    getTarget(out) {

        const _out = typeof out === 'object' && out.isVector3 ? out : new THREE.Vector3();
        return _out.copy(this._targetEnd);

    }

    getPosition(out) {

        const _out = typeof out === 'object' && out.isVector3 ? out : new THREE.Vector3();
        return _out.setFromSpherical(this._sphericalEnd).add(this._targetEnd);

    }

    reset(enableTransition) {

        this.setLookAt(
            this._position0.x, this._position0.y, this._position0.z,
            this._target0.x, this._target0.y, this._target0.z,
            enableTransition
        );

    }

    saveState() {

        this._target0.copy(this._target);
        this._position0.copy(this.object.position);
        this._zoom0 = this.object.zoom;

    }

    update(delta) {

        // var offset = new THREE.Vector3();
        // var quat = new THREE.Quaternion().setFromUnitVectors( this.object.up, new THREE.Vector3( 0, 1, 0 ) );
        // var quatInverse = quat.clone().inverse();

        const dampingFactor = 1.0 - Math.exp(-this.dampingFactor * delta / 0.016);
        const deltaTheta = this._sphericalEnd.theta - this._spherical.theta;
        const deltaPhi = this._sphericalEnd.phi - this._spherical.phi;
        const deltaRadius = this._sphericalEnd.radius - this._spherical.radius;
        const deltaTarget = new THREE.Vector3().subVectors(this._targetEnd, this._target);

        if (
            Math.abs(deltaTheta) > EPSILON ||
            Math.abs(deltaPhi) > EPSILON ||
            Math.abs(deltaRadius) > EPSILON ||
            Math.abs(deltaTarget.x) > EPSILON ||
            Math.abs(deltaTarget.y) > EPSILON ||
            Math.abs(deltaTarget.z) > EPSILON
        ) {

            this._spherical.set(
                this._spherical.radius + deltaRadius * dampingFactor,
                this._spherical.phi + deltaPhi * dampingFactor,
                this._spherical.theta + deltaTheta * dampingFactor
            );

            this._target.add(deltaTarget.multiplyScalar(dampingFactor));

            this._needsUpdate = true;

        } else {

            this._spherical.copy(this._sphericalEnd);
            this._target.copy(this._targetEnd);

        }

        this._spherical.makeSafe();
        this.object.position.setFromSpherical(this._spherical).add(this._target);
        this.object.lookAt(this._target);

        const updated = this._needsUpdate;
        if (updated) {
            this.dispatchEvent({
                type: 'update'
            });
        }

        this._needsUpdate = false;

        return updated;

    }

    toJSON() {

        return JSON.stringify({
            enabled: this.enabled,

            minDistance: this.minDistance,
            maxDistance: infinityToMaxNumber(this.maxDistance),
            minPolarAngle: this.minPolarAngle,
            maxPolarAngle: infinityToMaxNumber(this.maxPolarAngle),
            minAzimuthAngle: infinityToMaxNumber(this.minAzimuthAngle),
            maxAzimuthAngle: infinityToMaxNumber(this.maxAzimuthAngle),
            dampingFactor: this.dampingFactor,
            draggingDampingFactor: this.draggingDampingFactor,
            dollySpeed: this.dollySpeed,
            truckSpeed: this.truckSpeed,

            target: this._targetEnd.toArray(),
            position: this.object.position.toArray(),

            target0: this._target0.toArray(),
            position0: this._position0.toArray(),
        });

    }

    fromJSON(json, enableTransition) {

        const obj = JSON.parse(json);
        const position = new THREE.Vector3().fromArray(obj.position);

        this.enabled = obj.enabled;

        this.minDistance = obj.minDistance;
        this.maxDistance = maxNumberToInfinity(obj.maxDistance);
        this.minPolarAngle = obj.minPolarAngle;
        this.maxPolarAngle = maxNumberToInfinity(obj.maxPolarAngle);
        this.minAzimuthAngle = maxNumberToInfinity(obj.minAzimuthAngle);
        this.maxAzimuthAngle = maxNumberToInfinity(obj.maxAzimuthAngle);
        this.dampingFactor = obj.dampingFactor;
        this.draggingDampingFactor = obj.draggingDampingFactor;
        this.dollySpeed = obj.dollySpeed;
        this.truckSpeed = obj.truckSpeed;

        this._target0.fromArray(obj.target0);
        this._position0.fromArray(obj.position0);

        this._targetEnd.fromArray(obj.target);
        this._sphericalEnd.setFromVector3(position.sub(this._target0));

        if (!enableTransition) {

            this._target.copy(this._targetEnd);
            this._spherical.copy(this._sphericalEnd);

        }

        this._needsUpdate = true;

    }

    _sanitizeSphericals() {

        this._sphericalEnd.theta = this._sphericalEnd.theta % (2 * Math.PI);
        this._spherical.theta += 2 * Math.PI * Math.round(
            (this._sphericalEnd.theta - this._spherical.theta) / (2 * Math.PI)
        );

    }

}

function toVector3(value) {

    if (!value) {

        return null;

    } else if (value.isVector3) {

        return value;

    } else if (Array.isArray(value)) {

        return new THREE.Vector3().fromArray(value);

    } else {

        return new THREE.Vector3();

    }

}

function infinityToMaxNumber(value) {

    if (isFinite(value)) return value;

    if (value < 0) return - Number.MAX_VALUE;

    return Number.MAX_VALUE;

}

function maxNumberToInfinity(value) {

    if (Math.abs(value) < Number.MAX_VALUE) return value;

    return value * Infinity;

}
