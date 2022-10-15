import { installEventerCenter } from "./EventCenter.js";
import { isObject, hasChanged, deepClone } from './utils';


// defineStore，store.patch 
export function defineStore(options) {
  const obj = {
    ...options.state,
    ...options.actions,
    // 批量修改值
    patch(val) {
      if (typeof val === "object") {
        for (let k in val) {
          store[k] = val[k];
        }
      }

      if (typeof val === "function") {
        val(store);
      }
    },
    // 组件无法劫持生命周期自动取消订阅，故提供方法
    cancelUse(_this) {
      _this.onUnload();
    }
  };
  installEventerCenter(obj);

  function createGetter() {
    return function get(target, key, receiver) {
      const res = Reflect.get(target, key, receiver);
      // 深层代理对象的关键！！！判断这个属性是否是一个对象，是的话继续代理动作，使对象内部的值可追踪
      if (isObject(res)) {
        return reactive(res);
      }
      return res;
    };
  }

  function createSetter() {
    return function set(target, key, value, receiver) {
      const oldStore = deepClone(store);
      const result = Reflect.set(target, key, value, receiver);

      Reflect.ownKeys(store.subscribeList).forEach(key => {
        const oldValue = oldStore[key];
        const value = store[key];
        if (hasChanged(oldValue, value)) {
          store.subscribeList[key].forEach(fn => fn(store[key]));
        }
      })
      return result;
    };
  }

  const mutableHandlers = {
    get: createGetter(),
    set: createSetter(),
  };

  function reactive(target) {
    return createReactiveObject(target, mutableHandlers);
  }
  // 创建一个响应式对象
  function createReactiveObject(target, baseHandlers) {
    const proxy = new Proxy(target, baseHandlers);
    return proxy;
  }

  let store = null;

  store = reactive(obj)

  /**
   * 注意：该方法一定要在onLoad里面调用
   * _this 当前页面的this
   * arrState 需要映射的数据
   * arrActions 需要映射的方法
   */
  return function (_this, arrState = [], arrActions = []) {
    // 调用函数的时候就要注入state，actions和store
    arrActions.forEach((fn) => (_this[fn] = store[fn].bind(store)));
    _this.data.store = store;
    const data = {};
    arrState.forEach((key) => (data[key] = store[key]));
    _this.setData(data)

    const callBacks = {};
    arrState.forEach(key => {
      callBacks[key] = (value) => { _this.setData({ [key]: value }); }
      store.subscribe(key, callBacks[key]);
    });
    // console.debug(store.subscribeList);

    const _onUnload = _this.onUnload || function () { };
    _this.onUnload = function () {
      // 装饰onUnload取消订阅，性能优化
      _onUnload();

      Reflect.ownKeys(callBacks).forEach(k => store.remove(k, callBacks[k]));
    };

    return store;
  };
}

// 单独写兄弟组件传值api是为了关注点分离
// 只能用于组件通信，除此之外全部用store
const brotherPassValue = (function () {
  const obj = {};
  installEventerCenter(obj);

  return {
    passValue(name, value) {
      obj.publish(name, value);
    },
    receiveValue(_this, name, fn = (val) => val, isMapState = true) {
      let handle;
      // 是否映射到data里面
      if (isMapState) {
        _this.setData({ [name]: "" });
        handle = (value) => {
          _this.setData({ [name]: fn(value) });
        };
      } else {
        handle = (name) => {
          fn(name);
        };
      }

      obj.subscribe(name, handle);
    },
    // 组件劫持不了生命周期，无法自动注入，需要手动注入
    cancelReceive(name) {
      obj.remove(name);
    },
  };
})();

const { passValue, receiveValue, cancelReceive } = brotherPassValue;

export { passValue, receiveValue, cancelReceive };


