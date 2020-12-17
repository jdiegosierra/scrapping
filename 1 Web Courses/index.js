const puppeteer = require('puppeteer');
const fs = require('fs');
const readline = require('readline');
const https = require('https');
const rimraf = require('rimraf');

(async () => {
    const pathDest = process.argv.slice(2)[0] || '.';
    const fileStream = fs.createReadStream('./courses.txt');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    let courses = [];
    for await (const courseURL of rl) {
        courses.push(courseURL);
    }
    const chromeOptions = {
        headless: false,
        defaultViewport: null,
        executablePath: '/usr/bin/google-chrome',
        args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
    };
    const browser = await puppeteer.launch(chromeOptions);
    const page = await browser.newPage();
    await page.setDefaultTimeout(0);
    await page.setCookie(...require('./cookies'));
    for (const courseURL of courses) {
        await downloadCourse(courseURL, pathDest, page);
    }
    console.log('All courses downloaded :D')
    process.exit();
})();

const downloadCourse = async (courseURL, pathDest, page) => {
    console.log('Downloading course', courseURL);
    await page.goto(courseURL, {waitUntil: 'networkidle2'});
    const courseTitle = await initCourse(pathDest, page);
    const chaptersQuantity = await getChaptersQuantity(page);
    for (let currentChapter = 0; currentChapter < chaptersQuantity; currentChapter += 1) {
        const chapterTitle = await getChapterTitle(currentChapter, page);
        createChapterFolder(pathDest, courseTitle, currentChapter, chapterTitle);
        const lessonsQuantity = await getLessonsQuantity(currentChapter, page);
        for (let currentLesson = 0; currentLesson < lessonsQuantity; currentLesson += 1) {
            await downloadLesson(courseTitle, chapterTitle, currentChapter, currentLesson, pathDest, page)
        }
        console.log('Final chapter reached');
    }
    console.log('Course downloaded! :)')
}

const initCourse = async (pathDest, page) => {
    console.log('Initializing course');
    let courseTitle;
    try {
        await startCourse(page);
    } catch (e) {}
    try {
        courseTitle = await getCourseTitle(page);
        createDestFolder(pathDest, courseTitle);
    } catch (e) {
        console.log(`Couldn't get the course title`);
        process.exit();
    }
    console.log(courseTitle);
    return courseTitle;
}

const startCourse = async (page) => {
    await page.waitForSelector('gu-take-course-button button', {timeout: 5000});
    await page.evaluate(() => document.querySelector('gu-take-course-button button').click());
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
}

const getCourseTitle = async (page) => {
    await page.waitForSelector('.iPJApC');
    return await page.evaluate(() => document.querySelector('.iPJApC').textContent.replaceAll('/', '-'));
}

const createDestFolder = (pathDest, courseTitle) => {
    console.log('Creating course', `${pathDest}/${courseTitle}`);
    fs.existsSync(`${pathDest}/${courseTitle}`) && rimraf.sync(`${pathDest}/${courseTitle}`);
    fs.mkdirSync(`${pathDest}/${courseTitle}`);
}

const getChaptersQuantity = async (page) => {
    console.log('Getting chapters quantity');
    await page.waitForSelector('.dhTuFA');
    return await page.evaluate(() => document.querySelectorAll('.dhTuFA').length);
}

const getChapterTitle = async (chapter, page) => {
    console.log('Getting chapter title');
    await page.waitForSelector('.dhTuFA');
    return await page.evaluate((chapter) => document.querySelectorAll('.dhTuFA')[chapter].getElementsByTagName('h3')[0].textContent.replaceAll('/', '-'), chapter);
}

const createChapterFolder = (pathDest, courseTitle, currentChapter, chapterTitle) => {
    console.log('Creating chapter folder', `${pathDest}/${courseTitle}/${currentChapter + 1} ${chapterTitle}`);
    fs.mkdirSync(`${pathDest}/${courseTitle}/${currentChapter + 1} ${chapterTitle}`);
}

const getLessonsQuantity = async (chapter, page) => {
    console.log('Getting lessons quantity in chapter', chapter+1);
    await page.waitForSelector('.dhTuFA');
    return await page.evaluate((chapter) => document.querySelectorAll('.dhTuFA')[chapter].getElementsByTagName('a').length, chapter);
}

const downloadLesson = async (courseTitle, chapterTitle, chapter, lesson, pathDest, page) => {
    console.log('Downloading lesson', lesson+1, 'in chapter', chapter+1);
    let mainCourseURL, lessonTitle, retry = true;
    await new Promise(r => setTimeout(r, 1000));
    do {
        try {
            mainCourseURL = await page.url();
            lessonTitle = await getLessonTitle(chapter, lesson, page);
            retry = false;
        } catch (e) {
            console.log('RELOADING!')
            page.reload();
        }
    } while (retry);
    if (await isLessonQuiz(chapter, lesson, page)) {
        console.log(`It's a quiz!!!`);
    } else if (await isLessonLab(chapter, lesson, page)){
        console.log(`It's a lab!!!`);
        await clickOnLesson(chapter, lesson, page);
        await new Promise(r => setTimeout(r, 1000));
        await downloadLab(courseTitle, chapterTitle, lessonTitle, chapter, lesson, pathDest, page);
        await page.goto(mainCourseURL, {waitUntil: 'networkidle2'});
    } else {
        console.log(`It's a lesson video!!!`);
        await clickOnLesson(chapter, lesson, page);
        await new Promise(r => setTimeout(r, 1000));
        await downloadLessonVideo(courseTitle, chapterTitle, lessonTitle, chapter, lesson, pathDest, page);
        await page.goto(mainCourseURL, {waitUntil: 'networkidle2'});
    }
    console.log('Finished download lesson');
}

const getLessonTitle = async (chapter, lesson, page) => {
    await page.waitForSelector('span.kvAOja', {timeout: 5000});
    return await page.evaluate((chapter, lesson) => document.querySelectorAll('.dhTuFA')[chapter].querySelectorAll('div.YiIHj')[lesson].querySelector('span.kvAOja').textContent.replaceAll('/', '-'), chapter, lesson);
}

const isLessonQuiz = async (chapter, lesson, page) => {
    console.log('Is a quiz?');
    await page.waitForSelector('div.YiIHj');
    return await page.evaluate((chapter, lesson) => {
        if (document.querySelectorAll('.dhTuFA')[chapter].querySelectorAll('div.YiIHj')[lesson].querySelector('.ant-tag')) {
            return ['quiz', 'exam'].some((quizType) => document.querySelectorAll('.dhTuFA')[chapter].querySelectorAll('div.YiIHj')[lesson].querySelector('.ant-tag').textContent.toLowerCase().includes(quizType));
        }
        return false;
    }, chapter, lesson);
}

const isLessonLab = async (chapter, lesson, page) => {
    console.log('Is a lab?');
    await page.waitForSelector('div.YiIHj');
    return await page.evaluate((chapter, lesson) => {
        if (document.querySelectorAll('.dhTuFA')[chapter].querySelectorAll('div.YiIHj')[lesson].querySelector('.ant-tag')) {
            return document.querySelectorAll('.dhTuFA')[chapter].querySelectorAll('div.YiIHj')[lesson].querySelector('.ant-tag').textContent.toLowerCase().includes('lab');
        }
        return false;
    }, chapter, lesson);
}

const clickOnLesson = async (chapter, lesson, page) => {
    await page.waitForSelector('.dhTuFA');
    await page.evaluate((chapter, lesson) => document.querySelectorAll('.dhTuFA')[chapter].getElementsByTagName('a')[lesson].click(), chapter, lesson);
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
}

const downloadLab = async (courseTitle, chapterTitle, lessonTitle, chapter, lesson, pathDest, page) => {
    console.log('Creating lab', `${pathDest}/${courseTitle}/${chapter + 1} ${chapterTitle}/${lesson + 1} ${lessonTitle}`);
    fs.mkdirSync(`${pathDest}/${courseTitle}/${chapter + 1} ${chapterTitle}/${lesson + 1} ${lessonTitle}`);
    await startLab(page);
    await new Promise(r => setTimeout(r, 3000));
    let labCounter = 1;
    while(!await isNextButtonDisabled(page)) {
        await downloadLabVideo(courseTitle, chapterTitle, lessonTitle, chapter, lesson, labCounter, pathDest, page);
        await clickOnNext(page);
        labCounter += 1;
    }
    await downloadLabVideo(courseTitle, chapterTitle, lessonTitle, chapter, lesson, labCounter, pathDest, page);
    await exitLab(page);
}

const startLab = async (page) => {
    console.log('Starting lab');
    try {
        await page.waitForSelector('span.ant-checkbox', {timeout: 5000});
        await page.evaluate(() => document.querySelector('span.ant-checkbox').click());
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        await page.waitForSelector('span.ant-checkbox', {timeout: 5000});
        await page.evaluate(() => document.querySelector('button.ant-btn-positive').click());
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
    } catch (e) {}
    await page.waitForSelector('div.progress');
    await page.evaluate(() => document.querySelector('div.progress').click());
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
}

const isNextButtonDisabled = async (page) => {
    try {
        await page.waitForSelector('button[disabled]', {timeout: 3000});
        return await page.evaluate(() => document.querySelector('button[disabled]').textContent.toLowerCase().includes('next'));
    } catch (e) {
        return false
    }
}

const downloadLessonVideo = async (courseTitle, chapterTitle, lessonTitle, chapter, lesson, pathDest, page) => {
    console.log('Creating lesson', `${pathDest}/${courseTitle}/${chapter + 1} ${chapterTitle}/${lesson + 1} ${lessonTitle}.mp4`);
    let retry = true;
    do {
        try {
            await page.waitForSelector('video', {timeout: 5000});
            retry = false;
        } catch (e) {
            console.log('RELOADING!')
            page.reload();
        }
    } while (retry);
    const videoURL = await page.evaluate(() => document.querySelector('video').src);
    const file = fs.createWriteStream(`${pathDest}/${courseTitle}/${chapter + 1} ${chapterTitle}/${lesson + 1} ${lessonTitle}.mp4`);
    console.log('Downloading', videoURL);
    https.get(videoURL, function(response) {
        response.pipe(file);
    });
}

const downloadLabVideo = async (courseTitle, chapterTitle, lessonTitle, chapter, lesson, lab, pathDest, page) => {
    await page.waitForSelector('.css-h2kzqu');
    const labTitle = await page.evaluate(() => document.querySelectorAll('.css-h2kzqu')[0].textContent.replaceAll('/', '-'));
    console.log('Creating lab lesson', `${pathDest}/${courseTitle}/${chapter + 1} ${chapterTitle}/${lesson + 1} ${lessonTitle}/${lab} ${labTitle}.mp4`);
    await page.waitForSelector('video');
    const videoURL = await page.evaluate(() => document.querySelector('video').src);
    const file = fs.createWriteStream(`${pathDest}/${courseTitle}/${chapter + 1} ${chapterTitle}/${lesson + 1} ${lessonTitle}/${lab} ${labTitle}.mp4`);
    console.log('Downloading', videoURL);
    https.get(videoURL, function(response) {
        response.pipe(file);
    });
}

const clickOnNext = async (page) => {
    await page.waitForSelector('.ant-btn-default');
    await page.evaluate(() => document.querySelectorAll('.ant-btn-default')[1].click());
}

const exitLab = async (page) => {
    console.log('Exiting lab');
    await page.waitForSelector('.ant-btn-outline');
    await page.evaluate(() => document.querySelector('.ant-btn-outline').click());
    await page.waitForSelector('.ant-btn-danger');
    await page.evaluate(() => document.querySelector('.ant-btn-danger').click());
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
}
