/*

Example code for testing multple API endpoints through configuration object.

You can run this locally with `node multiple-requests.js` 
(be sure to `npm install` first!)

Note that running locally may trigger an unhandled promise which is caught when running in New Relic.

For further docs see https://docs.newrelic.com/docs/synthetics/new-relic-synthetics/scripting-monitors/write-synthetics-api-tests
and for api reference see https://docs.newrelic.com/docs/synthetics/new-relic-synthetics/scripting-monitors/add-custom-attributes-new-relic-synthetics-data

*/




// Configurations
const VERBOSE_LOG=true          // Control how much logging there is
const DEFAULT_TIMEOUT = 5000    // You can specify a timeout for each test, if not specified this is used.


//Specify each of your test URLs here
const testSet=[
    {
        title: "Test 1",
        responseCodes: [200],
        request: {
            url: `http://www.mocky.io/v2/5ec7be012f0000aa3d42740f`,
            method: 'GET',
            headers :{
              "Cache-Control": "no-cache",
            }
        }
    },
    {
        title: "Test 2",
        responseCodes: [201],   //this 201 code is not returned so this test should fail1
        request: {
            url: `http://www.mocky.io/v2/5ec7be012f0000aa3d42740f`,
            method: 'GET',
            headers :{
              "Cache-Control": "no-cache",
            }
        }
    },
    {
        title: "Test 3 (POST)",
        responseCodes: [200],
        request: {
            url: `http://www.mocky.io/v2/5ec7be012f0000aa3d42740f`,
            method: 'POST',
            headers :{
              "Cache-Control": "no-cache",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ "some": "object"})
        }
    },
]





//variables declaration, dont  change these values
let assert = require('assert');
let RUNNING_LOCALLY = false



/*
*  ========== LOCAL TESTING CONFIGURATION ===========================
*  This section allows you to run the script from your local machine
*  mimicking it running in the new relic environment. Much easier to develop!
*/

const IS_LOCAL_ENV = typeof $http === 'undefined';
if (IS_LOCAL_ENV) {  
  RUNNING_LOCALLY=true
  var $http = require("request");       //only for local development testing
  var $secure = {}                      //only for local development testing
  $secure.EXAMPLE_SECRET="LocalSecret"  //example of how to mimic a secure credential
  console.log("Running in local mode")
} 

//just an example showing the secure credential differences local and server side.
//console.log(`Example secure cred store secret: ${$secure.EXAMPLE_SECRET}`)


/*
*  ========== SOME HELPER FUNCTIONS ===========================
*/


/*
* log()
*
* A logger, that logs only if verbosity is enabled
*
* @param {string|object} data - the data to log out
* @param {bool} verbose - if true overrides global setting
*/
const log = function(data, verbose) {
    if(VERBOSE_LOG || verbose) { console.log(data) }
}

/*
* asyncForEach()
*
* A handy version of forEach that supports await.
* @param {Object[]} array     - An array of things to iterate over
* @param {function} callback  - The callback for each item
*/
async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }
  

/*
* genericServiceCall()
* Generic service call helper for commonly repeated tasks
*
* @param {number} responseCodes  - The response code (or array of codes) expected from the api call (e.g. 200 or [200,201])
* @param {Object} options       - The standard http request options object
* @param {function} success     - Call back function to run on successfule request
*/
const  genericServiceCall = function(responseCodes,options,success) {
    !('timeout' in options) && (options.timeout = DEFAULT_TIMEOUT) //add a timeout if not already specified 
    let possibleResponseCodes=responseCodes
    if(typeof(responseCodes) == 'number') { //convert to array if not supplied as array
      possibleResponseCodes=[responseCodes]
    }
    return new Promise((resolve, reject) => {
        $http(options, function callback(error, response, body) {
        if(error) {
            reject(`Connection error on url '${options.url}'`)
        } else {
            if(!possibleResponseCodes.includes(response.statusCode)) {
                let errmsg=`Expected [${possibleResponseCodes}] response code but got '${response.statusCode}' from url '${options.url}'`
                reject(errmsg)
            } else {
                resolve(success(body,response,error))
            }
          }
        });
    })
  }

/*
* setAttribute()
* Sets a custom attribute on the synthetic record
*
* @param {string} key               - the key name
* @param {Strin|Object} value       - the value to set
*/
const setAttribute = function(key,value) {
    if(!RUNNING_LOCALLY) { //these only make sense when running on a minion
        $util.insights.set(key,value)
    } else {
        //log(`Set attribute '${key}' to ${value}`)
    }
}





async function runTests(tests) {
    let TOTALREQUESTS=0,SUCCESSFUL_REQUESTS=0,FAILED_REQUESTS=0
    let FAILURE_DETAIL = []
    await asyncForEach(tests, async (test) => {
        let options = {...test.request}
        TOTALREQUESTS++
        await genericServiceCall(test.responseCodes,options,()=>{})
        .then(()=>{
            SUCCESSFUL_REQUESTS++
            log(`Test '${test.title}' succeeded`)
        })
        .catch((e)=>{
            FAILED_REQUESTS++
            log(`Test '${test.title}' failed with error: ${e} `,true)
            FAILURE_DETAIL.push(`'${test.title}' failed with error: ${e} `)
        })
    })

    log(`Attempted: ${TOTALREQUESTS}, Succeded ${SUCCESSFUL_REQUESTS}, Failed: ${FAILED_REQUESTS}`,true)
    
    //record the statistics about the success rates as custom attributes on the SyntheticCheck event type
    setAttribute("testsAttempted",TOTALREQUESTS)
    setAttribute("testsSucceeded",SUCCESSFUL_REQUESTS)
    setAttribute("testsFailed",FAILED_REQUESTS)
    setAttribute("testsSuccessRate",((FAILED_REQUESTS/TOTALREQUESTS)*100).toFixed(2))
    setAttribute("failureDetail",FAILURE_DETAIL.join("; "))
    return FAILED_REQUESTS
}


/*
*  ========== RUN THE TESTS ===========================
*/



try {
    setAttribute("totalTests",testSet.length)
    runTests(testSet).then((failed)=>{
        setAttribute("testRunComplete","YES") //to ensure we've not timed out or broken somehow
        if(failed > 0 ) {
            setAttribute("testResult","FAILED")
            assert.fail('Not all tests passed') //assert a failure so that NR sees it as a failed test
        } else {
            setAttribute("testResult","SUCCESS")
            assert.ok("All tests passed")   
        }
    })

} catch(e) {
    console.log("Unexpected errors: ",e)
}
  